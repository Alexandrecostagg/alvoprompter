import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatStream } from './ai'
import { generateAvatar, speakWithTts, transcribeAudio, translateCloud } from './cloudflare'
vi.mock('./auth', () => ({ getOptionalIdToken: vi.fn(async () => 'test-token') }))
const operations = [
  ['chat', () => chatStream([{ role: 'user', content: 'Texto' }])],
  ['transcribe', () => transcribeAudio(new Blob(['audio']), 'pt')],
  ['tts', () => speakWithTts('Texto')],
  ['translate', () => translateCloud('Texto', 'en')],
  ['avatar', () => generateAvatar('Descrição')],
] as const
describe('AI actions without an extra provider/cost dialog', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => vi.unstubAllGlobals())
  it.each(operations)('%s executes the requested action directly', async (kind, execute) => {
    vi.mocked(fetch).mockImplementation(async () => {
      if (kind === 'chat') return new Response('data: {"choices":[{"delta":{"content":"Resultado"}}]}\n\ndata: [DONE]\n\n')
      if (kind === 'tts' || kind === 'avatar') return new Response(new Blob(['output']))
      return new Response(JSON.stringify({ result: { text: 'Resultado', translated_text: 'Resultado' } }))
    })
    await execute()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
  })
  it('does not send a canceled chat or transcription', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(chatStream([], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(transcribeAudio(new Blob(['audio']), 'pt', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
