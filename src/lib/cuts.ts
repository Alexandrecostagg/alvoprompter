import type { CaptionUtterance } from './srt'
import type { RenderRange } from './video/render'

export interface WordTiming {
  word: string
  start: number
  end: number
}

/**
 * Velocidade média de fala usada para estimar a duração de cada palavra a
 * partir do número de caracteres (~13 caracteres por segundo, ≈ 150 wpm).
 */
export const CHARS_PER_SECOND = 13

/** Recognition events are approximate phrase ends, not acoustic word timestamps.
 * Keep estimates bounded by the previous event and this event. Future events
 * must never move a phrase that has already been estimated.
 */
export function estimateSpeechSegments(utterances: CaptionUtterance[]) {
  const clean = utterances.map(u => ({ text: u.text.trim().replace(/\s+/g, ' '), at: u.at }))
    .filter(u => u.text && Number.isFinite(u.at) && u.at > 0).sort((a, b) => a.at - b.at)
  let previousEnd = 0
  return clean.flatMap(u => {
    const chars = u.text.replace(/\s/g, '').length
    const start = Math.max(previousEnd, u.at - chars / CHARS_PER_SECOND, 0)
    previousEnd = u.at
    return u.at > start ? [{ text: u.text, start, end: u.at }] : []
  })
}

export function estimateWordTimings(utterances: CaptionUtterance[]): WordTiming[] {
  return estimateSpeechSegments(utterances).flatMap(segment => {
    const tokens = segment.text.split(' ')
    const chars = tokens.reduce((sum, word) => sum + word.length, 0)
    let cursor = segment.start
    return tokens.map((word, i) => {
      const start = cursor
      cursor = i === tokens.length - 1 ? segment.end : cursor + word.length / chars * (segment.end - segment.start)
      return { word, start, end: cursor }
    })
  })
}

export interface AutoCutOptions {
  /** Pausas maiores que isso (em segundos) são cortadas. */
  minSilence: number
  /** Margem (em segundos) mantida antes/depois de cada bloco de fala. */
  pad: number
}

/**
 * Gera os trechos a manter (keepRanges) removendo as pausas maiores que
 * `minSilence` entre palavras faladas. Palavras próximas são agrupadas num
 * mesmo trecho.
 */
export function autoCutRanges(words: WordTiming[], opts: AutoCutOptions): RenderRange[] {
  if (!words.length) return []
  const { minSilence, pad } = opts
  const ranges: RenderRange[] = []
  let start = Math.max(0, words[0]!.start - pad)
  let end = words[0]!.end + pad
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!
    if (w.start - end > minSilence) {
      ranges.push({ start, end })
      start = Math.max(0, w.start - pad)
      end = w.end + pad
    } else {
      end = Math.max(end, w.end + pad)
    }
  }
  ranges.push({ start, end })
  return ranges
}

/** Duração total (s) de um conjunto de trechos. */
export function totalRangesDuration(ranges: RenderRange[]): number {
  return ranges.reduce((s, r) => s + Math.max(0, r.end - r.start), 0)
}

export interface AudioSpeechOptions {
  /** Pausas maiores que isso (em segundos) são cortadas. */
  minSilence: number
  /** Margem (em segundos) mantida antes/depois de cada bloco de fala. */
  pad: number
  /** Limiar em dB relativo ao pico (ex.: -30). Menos negativo = mais sensível. */
  thresholdDb: number
  /** Tamanho da janela de análise RMS em ms. */
  windowMs?: number
}

function mixDown(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  const out = new Float32Array(n)
  const chs = buffer.numberOfChannels
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += d[i]
  }
  if (chs > 1) for (let i = 0; i < n; i++) out[i] /= chs
  return out
}

/**
 * Detecta os trechos com som (fala/música) do áudio de uma gravação por RMS,
 * gerando keepRanges que removem silêncios. Não depende de transcrição.
 */
export function detectSpeechRanges(buffer: AudioBuffer, opts: AudioSpeechOptions): RenderRange[] {
  const { minSilence, pad, thresholdDb } = opts
  const windowMs = opts.windowMs ?? 50
  const sr = buffer.sampleRate
  const win = Math.max(1, Math.floor((sr * windowMs) / 1000))
  const step = Math.max(1, Math.floor(win / 2))
  const n = buffer.length
  const mix = mixDown(buffer)
  const dur = n / sr

  let peak = 0
  const rms: number[] = []
  for (let off = 0; off < n; off += step) {
    const end = Math.min(n, off + win)
    let sum = 0
    for (let i = off; i < end; i++) sum += mix[i]! * mix[i]!
    const v = Math.sqrt(sum / (end - off))
    rms.push(v)
    if (v > peak) peak = v
  }
  if (peak === 0) return []

  const threshold = peak * Math.pow(10, thresholdDb / 20)
  const ranges: RenderRange[] = []
  let cur: RenderRange | null = null
  for (let i = 0; i < rms.length; i++) {
    if (rms[i]! > threshold) {
      const s = (i * step) / sr
      const e = Math.min(dur, (i * step + win) / sr)
      if (!cur) {
        cur = { start: s, end: e }
      } else if (s - cur.end > minSilence) {
        ranges.push(cur)
        cur = { start: s, end: e }
      } else {
        cur.end = e
      }
    }
  }
  if (cur) ranges.push(cur)

  return ranges.map((r) => ({
    start: Math.max(0, r.start - pad),
    end: Math.min(dur, r.end + pad),
  }))
}
