import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeTranscript, transcribeWithTimestamps } from './transcription'
const file = () => new File(['synthetic'], 'audio.wav', { type: 'audio/wav' })
const result = { text: 'Olá', words: [{ word: 'Olá', start: 0, end: 0.5 }] }
afterEach(() => vi.unstubAllGlobals())
describe('speech provider timestamps', () => {
  it('requests actual word timestamps through Groq and keeps the key on the server', async () => {
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      const form = init.body as FormData
      expect(form.get('response_format')).toBe('verbose_json')
      expect(form.getAll('timestamp_granularities[]')).toEqual(['word', 'segment'])
      expect(form.get('file')).toBeInstanceOf(File)
      return Response.json(result)
    })
    vi.stubGlobal('fetch', fetcher)
    const ai = { run: vi.fn() }
    expect(await transcribeWithTimestamps(file(), 'pt-BR', { GROQ_API_KEY: 'test-only', AI: ai }, new AbortController().signal)).toEqual(result)
    expect(ai.run).not.toHaveBeenCalled()
  })
  it('falls back after quota failure and normalizes nested provider words', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    const ai = { run: vi.fn().mockResolvedValue({ text: 'Olá', segments: [{ words: result.words }] }) }
    expect(await transcribeWithTimestamps(file(), 'pt', { GROQ_API_KEY: 'test-only', AI: ai }, new AbortController().signal)).toEqual(result)
  })
  it('does not send cancelled work to another provider', async () => {
    const controller = new AbortController(); controller.abort()
    const ai = { run: vi.fn() }; const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(transcribeWithTimestamps(file(), 'pt', { GROQ_API_KEY: 'test', AI: ai }, controller.signal)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled(); expect(ai.run).not.toHaveBeenCalled()
  })
  it('preserves zero-duration words supplied by the model', () => { expect(normalizeTranscript({ text: 'A câmera', words: [{ word: 'A', start: 1, end: 1 }, { word: 'câmera', start: 1, end: 2 }] }).words).toHaveLength(2) })
  it('keeps slight acoustic overlap instead of dropping a spoken article', () => { expect(normalizeTranscript({ text: 'legendas. A', words: [{ word: 'legendas.', start: 1.86, end: 2.98 }, { word: 'A', start: 2.96, end: 3.14 }] }).words).toHaveLength(2) })
  it('does not manufacture timestamps for plain text', () => { expect(normalizeTranscript({ text: 'Olá' })).toEqual({ text: 'Olá', words: [] }) })
})
