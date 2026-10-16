import type { TimedWord } from './videoProjects'
import type { SrtSegment } from './srt'
import { formatSrtTime } from './srt'
import type { RenderRange } from './video/render'

export function validateTimedWords(input: unknown, duration: number): TimedWord[] {
  if (!Array.isArray(input)) throw new Error('A transcrição não retornou tempos por palavra. Tente novamente.')
  const result: TimedWord[] = []
  for (const value of input) {
    if (!value || typeof value.word !== 'string' || !value.word.trim() || !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start < 0 || value.end < value.start || value.end > duration + 0.15 || value.start < (result.at(-1)?.start ?? 0)) throw new Error('A transcrição retornou tempos inválidos. Suas legendas anteriores foram preservadas.')
    result.push({ word: value.word.trim(), start: value.start, end: Math.min(value.end, duration) })
  }
  if (!result.length) throw new Error('Não foram encontradas palavras com tempos. Verifique se o vídeo tem fala e tente novamente.')
  return result
}
export function captionsFromWords(words: TimedWord[]): SrtSegment[] {
  const segments: SrtSegment[] = []
  for (const word of words) {
    const previous = segments.at(-1)
    if (previous && previous.text.length + word.word.length < 43 && word.end - previous.start <= 4 && word.start - previous.end < 0.7 && !/[.!?]$/.test(previous.text)) {
      previous.text += ' ' + word.word; previous.end = word.end
    } else segments.push({ start: word.start, end: word.end, text: word.word })
  }
  return segments
}
/** Retain only spoken words intersecting the selected source ranges. Manually rewritten cues retain their text. */
export function captionsForRanges(segments: SrtSegment[], words: TimedWord[], ranges: RenderRange[]): (SrtSegment & { words?: TimedWord[] })[] {
  return ranges.flatMap(range => segments.flatMap(segment => {
    const start = Math.max(range.start, segment.start), end = Math.min(range.end, segment.end)
    if (end <= start || !segment.text.trim()) return []
    const original = words.filter(w => w.start >= segment.start && w.end <= segment.end)
    if (!original.length || original.map(w => w.word).join(' ') !== segment.text) return [{ start, end, text: segment.text }]
    const kept = original.filter(w => w.start < end && (w.end > start || w.start === w.end && w.start >= start))
    return kept.length ? [{ start, end, text: kept.map(w => w.word).join(' '), words: kept }] : []
  }))
}
export function captionsSrt(segments: SrtSegment[], ranges: RenderRange[], intro = 0): string {
  let offset = intro
  const cues: SrtSegment[] = []
  for (const range of ranges) {
    for (const seg of segments) {
      const start = Math.max(range.start, seg.start), end = Math.min(range.end, seg.end)
      if (end > start) cues.push({ start: offset + start - range.start, end: offset + end - range.start, text: seg.text })
    }
    offset += range.end - range.start
  }
  return cues.map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`).join('\n')
}
export function encodeMonoWav(samples: Float32Array, sampleRate = 16000): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes)
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((value, i) => { const sample = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0)); view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true) })
  return new Blob([bytes], { type: 'audio/wav' })
}
export async function extractTranscriptionAudio(blob: Blob, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted()
  const decoder = new OfflineAudioContext(1, 1, 16000)
  const audio = await decoder.decodeAudioData(await blob.arrayBuffer())
  signal.throwIfAborted()
  if (audio.duration > 12 * 60) throw new Error('Para transcrever, use uma tomada de até 12 minutos.')
  const renderer = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000)
  const source = renderer.createBufferSource(); source.buffer = audio; source.connect(renderer.destination); source.start()
  const mono = await renderer.startRendering()
  signal.throwIfAborted()
  return encodeMonoWav(mono.getChannelData(0))
}
