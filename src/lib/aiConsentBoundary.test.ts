import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestAiConsent } from './aiConsent'
import { chatStream } from './ai'
import { generateAvatar, speakWithTts, transcribeAudio, translateCloud } from './cloudflare'

vi.mock('./aiConsent', () => ({ requestAiConsent: vi.fn() }))
vi.mock('./auth', () => ({ getOptionalIdToken: vi.fn(async () => 'test-token') }))

const operations = [
  ['chat', () => chatStream([{ role: 'user', content: 'Texto privado' }])],
  ['transcribe', () => transcribeAudio(new Blob(['private audio']), 'pt')],
  ['tts', () => speakWithTts('Texto privado')],
  ['translate', () => translateCloud('Texto privado', 'en')],
  ['avatar', () => generateAvatar('Descrição privada')],
] as const

describe('permission before content leaves the device', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => vi.unstubAllGlobals())
  it.each(operations)('%s: refusal sends no request', async (_kind, execute) => {
    vi.mocked(requestAiConsent).mockRejectedValue(new DOMException('Não autorizado', 'AbortError'))
    await expect(execute()).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(operations)('%s: waits for explicit authorization', async (kind, execute) => {
    let authorize!: () => void
    vi.mocked(requestAiConsent).mockReturnValue(new Promise<void>(resolve => { authorize = resolve }))
    vi.mocked(fetch).mockImplementation(async () => {
      if (kind === 'chat') return new Response('data: {"choices":[{"delta":{"content":"Resultado"}}]}\n\ndata: [DONE]\n\n')
      if (kind === 'tts' || kind === 'avatar') return new Response(new Blob(['output']))
      return new Response(JSON.stringify({ result: { text: 'Resultado', translated_text: 'Resultado' } }))
    })
    const work = execute()
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    expect(requestAiConsent).toHaveBeenCalledWith(kind, ...(['chat', 'transcribe'].includes(kind) ? [undefined] : []))
    authorize()
    await work
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not send a chat canceled while the permission was open', async () => {
    const controller = new AbortController()
    vi.mocked(requestAiConsent).mockImplementation(async () => { controller.abort() })
    await expect(chatStream([], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
