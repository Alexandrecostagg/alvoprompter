import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../api/transcribe/src/index'
import { cascadeChat, chatHealth } from '../api/transcribe/src/chat'
import { testDatabase } from './d1-test-db'

vi.mock('jose', () => ({ decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }), importX509: async () => ({}), jwtVerify: async () => ({ payload: { auth_time: 1, sub: 'user', email: 'user@example.test', email_verified: true } }) }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
const secrets = { GEMINI_API_KEY: 'gemini-test', GROQ_API_KEY: 'groq-test' }
const input = { messages: [{ role: 'user', content: 'Roteiro de teste' }], temperature: 0.7, max_tokens: 8000 }
const token = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
const sse = (text = `${token('Olá')}data: [DONE]\n\n`) => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })

async function run(upstream: (url: string, init?: RequestInit) => Promise<Response>, body: unknown = input, keys = secrets) {
  const { db, sqlite } = testDatabase()
  const env = { DB: db, FIREBASE_PROJECT_ID: 'alvoprompt', ...keys, ALVOPROMPT_SYNC: { get: async () => null, put: async () => {} } } as unknown as Env
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('googleapis.com/robot')) return new Response(JSON.stringify({ test: 'certificate' }))
    calls.push(url)
    expect(JSON.parse(String(init?.body)).max_tokens).toBe(8000)
    return upstream(url, init)
  }))
  const waiting: Promise<unknown>[] = []
  const res = await worker.fetch(new Request('https://test.invalid/chat', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) }), env, { waitUntil: (p: Promise<unknown>) => waiting.push(p) } as unknown as ExecutionContext)
  const text = await res.text()
  await Promise.all(waiting)
  const used = sqlite.prepare('SELECT ai_actions FROM usage_monthly').get()?.ai_actions
  sqlite.close()
  return { status: res.status, used, text, calls }
}

describe('Gemini → Groq and monthly allowance', () => {
  it('uses only Gemini on success, keeping JSON mode and server credentials', async () => {
    const result = await run(async (url, init) => {
      expect(url).toContain('generativelanguage.googleapis.com')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer gemini-test')
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gemini-3.5-flash-lite', response_format: { type: 'json_object' } })
      return sse()
    }, { ...input, response_format: { type: 'json_object' } })
    expect(result).toMatchObject({ status: 200, used: 1 })
    expect(result.calls).toHaveLength(1)
  })
  it.each([401, 402, 403, 404, 408, 429, 500, 503])('falls back on HTTP %s and charges once', async (status) => {
    const result = await run(async (url, init) => {
      if (url.includes('googleapis')) return new Response('upstream detail', { status })
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer groq-test')
      expect(JSON.parse(String(init?.body)).model).toBe('openai/gpt-oss-120b')
      return sse()
    })
    expect(result).toMatchObject({ status: 200, used: 1 })
    expect(result.calls).toHaveLength(2)
    expect(result.text).not.toContain('upstream detail')
  })
  it('refunds if both providers fail, without disclosing provider details', async () => {
    const result = await run(async () => new Response('secret provider error', { status: 503 }))
    expect(result).toMatchObject({ status: 503, used: 0 })
    expect(result.calls).toHaveLength(2)
    expect(result.text).not.toContain('secret provider error')
  })
  it('tries Groq for an empty Gemini stream', async () => {
    const result = await run(async (url) => url.includes('googleapis') ? sse('data: [DONE]\n\n') : sse())
    expect(result).toMatchObject({ status: 200, used: 1 })
    expect(result.calls).toHaveLength(2)
  })
  it('refunds when both streams are empty', async () => {
    expect(await run(async () => sse('data: [DONE]\n\n'))).toMatchObject({ status: 503, used: 0 })
  })
  it('falls back on a network exception', async () => {
    const result = await run(async (url) => { if (url.includes('googleapis')) throw new TypeError('network'); return sse() })
    expect(result).toMatchObject({ status: 200, used: 1 })
  })
  it('does not route a content refusal to another provider', async () => {
    const result = await run(async () => sse('data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n'))
    expect(result).toMatchObject({ status: 422, used: 0 })
    expect(result.calls).toHaveLength(1)
  })
  it('does not retry an invalid upstream request', async () => {
    const result = await run(async () => new Response('', { status: 400 }))
    expect(result).toMatchObject({ status: 422, used: 0 })
    expect(result.calls).toHaveLength(1)
  })
  it('rejects malformed messages before providers and refunds the quota', async () => {
    expect(await run(async () => sse(), { messages: [null] })).toMatchObject({ status: 400, used: 0, calls: [] })
  })
  it('uses Groq directly when only its key is configured', async () => {
    const result = await run(async () => sse(), input, { ...secrets, GEMINI_API_KEY: '' })
    expect(result).toMatchObject({ status: 200, used: 1 })
    expect(result.calls).toEqual(['https://api.groq.com/openai/v1/chat/completions'])
  })
  it('never calls an old provider if the new keys are missing', async () => {
    expect(await run(async () => sse(), input, { GEMINI_API_KEY: '', GROQ_API_KEY: '' })).toMatchObject({ status: 503, used: 0, calls: [] })
  })
  it('reports configuration for each provider without exposing keys', () => {
    expect(chatHealth(secrets)).toMatchObject({ configured: true, fallbackReady: true })
    expect(chatHealth({ GROQ_API_KEY: 'test' })).toMatchObject({ configured: true, fallbackReady: false })
    expect(JSON.stringify(chatHealth(secrets))).not.toContain('gemini-test')
  })
})

describe('stream lifecycle', () => {
  it('cancels a stalled provider after 20 seconds before trying Groq', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('groq.com')) return sse()
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))))
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = cascadeChat(input, secrets, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(20_001)
    expect(await (await response).text()).toContain('Olá')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('times out headers without a first token', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('groq.com')) return sse()
      return new Response(new ReadableStream({ start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new Error('timeout')))
      } }), { headers: { 'Content-Type': 'text/event-stream' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = cascadeChat(input, secrets, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(20_001)
    expect(await (await response).text()).toContain('Olá')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('does not fall back when the user cancels', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async (_: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const response = cascadeChat(input, secrets, controller.signal)
    controller.abort()
    expect((await response).status).toBe(499)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('never mixes providers after text and signals a stream failure', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const fetchMock = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      streamController = controller
      controller.enqueue(new TextEncoder().encode(token('Início do roteiro')))
    } }), { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await cascadeChat(input, secrets, new AbortController().signal)
    streamController!.error(new Error('disconnected'))
    const text = await response.text()
    expect(text).toContain('Início do roteiro')
    expect(text).toContain('A geração foi interrompida')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
