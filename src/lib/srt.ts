export interface CaptionUtterance {
  text: string
  at: number
}

const MAX_LINE_CHARS = 46
const MAX_SEGMENT_SECONDS = 5

export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000))
  const ms = total % 1000
  const totalSec = Math.floor(total / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  const pad = (n: number, l = 2) => n.toString().padStart(l, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`
}

export interface SrtSegment {
  start: number
  end: number
  text: string
}

/**
 * Agrupa as falas capturadas em blocos de legenda com timing estimado.
 * A Web Speech API não entrega timestamps por palavra, então o tempo de
 * cada bloco é derivado do instante em que a fala foi reconhecida.
 */
export function groupUtterances(utterances: CaptionUtterance[]): SrtSegment[] {
  const clean = utterances
    .map((u) => ({ text: u.text.trim().replace(/\s+/g, ' '), at: u.at }))
    .filter((u) => u.text.length > 0 && Number.isFinite(u.at) && u.at >= 0)
    .sort((a, b) => a.at - b.at)

  if (!clean.length) return []

  let lastAt = 0
  const paced = clean.map((u) => {
    const at = u.at >= lastAt ? u.at : lastAt
    lastAt = at
    return { ...u, at }
  })

  const segments: SrtSegment[] = []
  let acc = 0
  let segStartIdx = 0
  let segStartAt = paced[0]!.at

  const closeSegment = (endIdx: number) => {
    if (endIdx <= segStartIdx) return
    const text = paced
      .slice(segStartIdx, endIdx)
      .map((x) => x.text)
      .join(' ')
    segments.push({ start: segStartAt, end: Math.max(segStartAt + 0.5, paced[endIdx - 1]!.at), text })
  }

  for (let i = 0; i < paced.length; i++) {
    const u = paced[i]!
    const len = u.text.length + 1
    const elapsed = u.at - segStartAt
    if (segStartIdx < i && (acc + len > MAX_LINE_CHARS || elapsed >= MAX_SEGMENT_SECONDS)) {
      closeSegment(i)
      segStartIdx = i
      segStartAt = u.at
      acc = 0
    }
    acc += len
  }
  closeSegment(paced.length)

  return segments
}

export function buildSrt(utterances: CaptionUtterance[]): string {
  return groupUtterances(utterances)
    .map((seg, i) => {
      const start = formatSrtTime(seg.start)
      const end = formatSrtTime(Math.max(seg.end, seg.start + 0.5))
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`
    })
    .join('\n')
}
