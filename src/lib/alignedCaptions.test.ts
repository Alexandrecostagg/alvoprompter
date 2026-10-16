import { describe, expect, it } from 'vitest'
import { captionsForRanges, captionsFromWords, captionsSrt, encodeMonoWav, validateTimedWords } from './alignedCaptions'
const words = [{ word: 'Olá', start: 1, end: 1.4 }, { word: 'mundo.', start: 1.5, end: 2 }, { word: 'Até', start: 4, end: 4.4 }, { word: 'logo.', start: 4.5, end: 5 }]
describe('audio-aligned captions', () => {
  it('preserves acoustic timestamps and splits across long pauses', () => {
    expect(validateTimedWords(words, 8)).toEqual(words)
    expect(captionsFromWords(words)).toEqual([{ start: 1, end: 2, text: 'Olá mundo.' }, { start: 4, end: 5, text: 'Até logo.' }])
  })
  it.each([undefined, [], [{ word: 'x', start: NaN, end: 1 }], [{ word: 'x', start: 2, end: 1 }], [{ word: 'x', start: 0, end: 9 }], [words[1], words[0]]])('rejects missing or invalid timing without inventing alignment: %j', input => {
    expect(() => validateTimedWords(input, 8)).toThrow()
  })
  it('removes cut words from video captions and offsets SRT after cuts and intro', () => {
    const ranges = [{ start: 1.5, end: 3 }, { start: 4, end: 6 }]
    const cues = captionsForRanges(captionsFromWords(words), words, ranges)
    expect(cues[0]?.text).toBe('mundo.')
    const srt = captionsSrt(cues, ranges, 2)
    expect(srt).toContain('00:00:02,000 --> 00:00:02,500\nmundo.')
    expect(srt).toContain('00:00:03,500 --> 00:00:04,500\nAté logo.')
    expect(srt).not.toContain('Olá')
  })
  it('keeps a deliberate manual correction without assigning unrelated word timing', () => {
    expect(captionsForRanges([{ start: 1, end: 2, text: 'Olá, Brasil!' }], words, [{ start: 0, end: 8 }])).toEqual([{ start: 1, end: 2, text: 'Olá, Brasil!' }])
  })
  it('keeps zero-duration articles returned by the provider without inventing a cut interval', () => {
    const input = [{ word: 'A', start: 3.14, end: 3.14 }, { word: 'câmera', start: 3.14, end: 3.52 }]
    const clean = validateTimedWords(input, 8)
    expect(captionsFromWords(clean)[0]?.text).toBe('A câmera')
    expect(captionsForRanges(captionsFromWords(clean), clean, [{ start: 3.14, end: 4 }])[0]?.text).toBe('A câmera')
  })
  it('preserves short articles whose acoustic boundaries overlap slightly', () => {
    const input = [{ word: 'legendas.', start: 1.86, end: 2.98 }, { word: 'A', start: 2.96, end: 3.14 }, { word: 'câmera', start: 3.14, end: 3.52 }]
    expect(captionsFromWords(validateTimedWords(input, 8)).map(s => s.text).join(' ')).toBe('legendas. A câmera')
  })
  it('encodes bounded 16-bit mono PCM with the correct WAV duration', async () => {
    const blob = encodeMonoWav(new Float32Array([-2, -1, 0, 1, 2, NaN]))
    const view = new DataView(await blob.arrayBuffer())
    expect(blob.type).toBe('audio/wav'); expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(22, true)).toBe(1); expect(view.getUint32(40, true)).toBe(12)
    expect(view.getInt16(44, true)).toBe(-32768); expect(view.getInt16(52, true)).toBe(32767); expect(view.getInt16(54, true)).toBe(0)
  })
})
