import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../api/transcribe/src/index'
import { generateSpeech, TTS_TIMEOUT_MS } from '../api/transcribe/src/tts'
import { testDatabase } from './d1-test-db'

vi.mock('jose', () => ({ decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }), importX509: async () => ({}), jwtVerify: async () => ({ payload: { auth_time: 1, sub: 'user', email: 'user@example.test', email_verified: true } }) }))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
const env = { GEMINI_API_KEY: 'private-test-key' }
const request = (body: unknown = { text: 'Olá, mundo.', lang: 'pt-BR' }, signal?: AbortSignal) => new Request('https://test.invalid/tts', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer test' }, signal })
function wav() {
  const bytes = Buffer.alloc(48)
  bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(1000, 44)
  return bytes
}
const result = (data = wav().toString('base64'), status = 'completed') => ({ status, steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data }] }] })

async function run(upstream: () => Response, body: unknown = { text: 'Olá!' }, authorized = true) {
  const { db, sqlite } = testDatabase()
  const ai = vi.fn()
  const provider = vi.fn(upstream)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot') ? Response.json({ test: 'certificate' }) : provider()))
  const waiting: Promise<unknown>[] = []
  const req = request(body)
  if (!authorized) req.headers.delete('Authorization')
  const response = await worker.fetch(req, { ...env, DB: db, FIREBASE_PROJECT_ID: 'alvoprompt', AI: { run: ai }, ALVOPROMPT_SYNC: { get: async () => null, put: async () => {} } } as unknown as Env, { waitUntil: (p: Promise<unknown>) => waiting.push(p) } as unknown as ExecutionContext)
  const bytes = await response.arrayBuffer()
  await Promise.all(waiting)
  const used = sqlite.prepare('SELECT ai_actions FROM usage_monthly').get()?.ai_actions
  sqlite.close()
  expect(ai).not.toHaveBeenCalled()
  return { response, bytes, used, calls: provider.mock.calls.length }
}

describe('Gemini narration', () => {
  it('sends literal text and private header, asks for WAV without storing the interaction', async () => {
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
      expect(new Headers(init.headers).get('x-goog-api-key')).toBe(env.GEMINI_API_KEY)
      expect(JSON.parse(String(init.body))).toMatchObject({ model: 'gemini-3.8-flash-lite-tts', store: false, stream: false, input: [{ type: 'user_input', content: [{ type: 'text', text: 'Olá, mundo.' }] }], response_format: { type: 'audio', mime_type: 'audio/wav' }, generation_config: { speech_config: [{ voice: 'Kore' }] } })
      return Response.json(result())
    })
    vi.stubGlobal('fetch', mock)
    const response = await generateSpeech(request(), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav())
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('charges one action for a complete file', async () => {
    const value = await run(() => Response.json(result()))
    expect(value.response.status).toBe(200)
    expect(value.used).toBe(1)
    expect(value.calls).toBe(1)
  })
  it.each([401, 403, 429, 500])('refunds failed synthesis (%s) without retries or raw errors', async (status) => {
    const value = await run(() => new Response('private upstream error', { status }))
    expect(value.response.status).toBe(status === 429 ? 429 : 503)
    expect(value.used ?? 0).toBe(0)
    expect(value.calls).toBe(1)
    expect(new TextDecoder().decode(value.bytes)).not.toContain('private upstream error')
  })
  it.each([null, {}, { text: 123 }, { text: ' ' }, { text: 'Olá', lang: {} }])('rejects invalid input before calling Gemini: %j', async (body) => {
    const value = await run(() => Response.json(result()), body)
    expect(value.response.status).toBe(400)
    expect(value.used ?? 0).toBe(0)
    expect(value.calls).toBe(0)
  })
  it('rejects long input before calling Gemini', async () => {
    const value = await run(() => Response.json(result()), { text: 'a'.repeat(5001) })
    expect(value.response.status).toBe(413)
    expect(value.calls).toBe(0)
  })
  it.each([{}, result('', 'completed'), result('invalid base64'), result(wav().subarray(0, 45).toString('base64')), result(wav().toString('base64'), 'incomplete')])('refunds malformed or partial audio', async (body) => {
    const value = await run(() => Response.json(body))
    expect(value.response.status).toBe(503)
    expect(value.used ?? 0).toBe(0)
  })
  it('requires login before generation', async () => {
    const value = await run(() => Response.json(result()), { text: 'Olá' }, false)
    expect(value.response.status).toBe(401)
    expect(value.calls).toBe(0)
  })
  it('does not call a provider without a key or after cancellation', async () => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock)
    expect((await generateSpeech(request(), {})).status).toBe(503)
    const abort = new AbortController(); abort.abort()
    expect((await generateSpeech(request(undefined, abort.signal), env)).status).toBe(499)
    expect(mock).not.toHaveBeenCalled()
  })
  it('aborts a stalled generation and gives a timeout message', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))))
    const pending = generateSpeech(request(), env)
    await vi.advanceTimersByTimeAsync(TTS_TIMEOUT_MS)
    expect((await pending).status).toBe(504)
  })
})
