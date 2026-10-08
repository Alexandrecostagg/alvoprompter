export interface WordToken {
  index: number
  word: string
  normalized: string
}

export function splitWords(content: string): WordToken[] {
  const words = content.split(/\s+/).map((w) => w.trim()).filter(Boolean)
  return words.map((word, index) => ({
    index,
    word,
    normalized: normalizeWord(word),
  }))
}

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[n]
}

/**
 * Similaridade 0..1 entre palavra falada e palavra esperada.
 * Tolerante a paráfrase leve e erros de ASR (sem acentos, prefixos, etc).
 */
export function similarity(spoken: string, expected: string): number {
  const a = normalizeWord(spoken)
  const b = normalizeWord(expected)
  if (!a || !b) return 0
  if (a === b) return 1
  const longer = Math.max(a.length, b.length)
  const shorter = Math.min(a.length, b.length)
  if (shorter < 2) return 0
  if (a.startsWith(b) || b.startsWith(a)) {
    return 0.7 + 0.3 * (shorter / longer)
  }
  const dist = levenshtein(a, b)
  return Math.max(0, 1 - dist / longer)
}

export function estimateDurationMinutes(words: number, wpm: number): number {
  if (words <= 0 || wpm <= 0) return 0
  return words / wpm
}

export function wordCount(content: string): number {
  return splitWords(content).length
}

// ---- Fillers & análise de leitura ----

export interface FillerMatch {
  word: string
  start: number
  end: number
  removable: boolean
}

const PURE_FILLERS = new Set([
  'hm', 'hmm', 'uhm', 'uhn', 'uh', 'ah', 'eh', 'ahn', 'ãhn', 'hum', 'ahã', 'né', 'éé',
])

const DISCOURSE_MARKERS = new Set([
  'tipo', 'sabe', 'assim', 'então', 'olha', 'veja', 'bom', 'aham', 'né', 'tá',
])

const FILLER_LABEL: Record<string, string> = {
  hm: 'hm', hmm: 'hmm', uhm: 'uhm', uhn: 'uhn', uh: 'uh', ah: 'ah', eh: 'eh',
  ahn: 'ahn', ãhn: 'ãhn', hum: 'hum', ahã: 'ahã', né: 'né', éé: 'éé',
  tipo: 'tipo', sabe: 'sabe', assim: 'assim', então: 'então', olha: 'olha',
  veja: 'veja', bom: 'bom', aham: 'aham', tá: 'tá',
}

const NORMALIZED_PURE_FILLERS = new Set(
  [...PURE_FILLERS].map((w) =>
    w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''),
  ),
)

const STOPWORDS = new Set([  'a', 'o', 'e', 'de', 'da', 'do', 'em', 'que', 'um', 'uma', 'para', 'por',
  'com', 'como', 'mais', 'mas', 'se', 'na', 'no', 'nos', 'os', 'as', 'dos',
  'das', 'ao', 'aos', 'voce', 'é', 'nao', 'sim', 'eu', 'ele', 'ela', 'eles',
  'elas', 'nos', 'me', 'te', 'seu', 'sua', 'isso', 'esse', 'essa', 'este',
  'esta', 'tem', 'ter', 'ser', 'foi', 'sao', 'está', 'estao', 'muito', 'tambem',
  'ja', 'depois', 'antes', 'quando', 'porque', 'pode', 'vai', 'vou', 'faz',
  'ainda', 'tudo', 'nada', 'aqui', 'onde', 'hoje', 'agora', 'sobre', 'entre',
  'ate', 'sem', 'dentro', 'fora', 'tao', 'bem', 'la', 'ai', 'dai', 'pois',
  'desde', 'durante', 'contra', 'so', 'cada', 'qual', 'quem', 'cujo',
])

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findFillers(content: string): FillerMatch[] {
  const matches: FillerMatch[] = []

  const pushWord = (label: string, start: number, end: number, removable: boolean) => {
    if (end <= start) return
    const overlap = matches.find(
      (m) => start < m.end && end > m.start,
    )
    if (overlap) {
      if (removable && !overlap.removable) {
        overlap.removable = true
        overlap.word = label
      }
      return
    }
    matches.push({ word: label, start, end, removable })
  }

  for (const word of [...PURE_FILLERS, ...DISCOURSE_MARKERS]) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegex(word)}(?![\\p{L}])`, 'giu')
    for (const m of content.matchAll(re)) {
      pushWord(word, m.index, m.index + m[0].length, PURE_FILLERS.has(word))
    }
  }

  for (const m of content.matchAll(/([aeiouáéíóúàâêôãõ])\1{2,}/gi)) {
    const label = m[0].slice(0, 3)
    pushWord(label, m.index, m.index + m[0].length, true)
  }

  return matches.sort((a, b) => a.start - b.start)
}

export function removeFillers(content: string, includeMarkers = false): string {
  const matches = findFillers(content)
    .filter((m) => includeMarkers || m.removable)
    .sort((a, b) => a.start - b.start)

  if (!matches.length) return content.trim()

  const parts: string[] = []
  let cursor = 0
  for (const m of matches) {
    if (m.start < cursor) continue
    parts.push(content.slice(cursor, m.start))
    cursor = m.end
  }
  parts.push(content.slice(cursor))

  return parts
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,(\s*[?.!])/g, '$1')
    .replace(/([?!.])\s*,\s*/g, '$1 ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ ,;:]+|[ ,;:]+$/g, '')
    .trim()
}

export interface ReadingStats {
  words: number
  sentences: number
  avgWordsPerSentence: number
  durationMinutes: number
  keywords: { word: string; count: number }[]
}

export function readingStats(content: string, wpm = 150): ReadingStats {
  const tokens = splitWords(content)
  const words = tokens.length

  const sentenceParts = content
    .split(/(?:[.!?…]+(?:\s+|$)|\n+)/)
    .map((p) => p.trim())
    .filter(Boolean)
  const sentences = sentenceParts.length

  const freq = new Map<string, number>()
  for (const t of tokens) {
    if (!t.normalized || STOPWORDS.has(t.normalized)) continue
    if (NORMALIZED_PURE_FILLERS.has(t.normalized)) continue
    if (/([aeiou])\1{2,}$/.test(t.normalized)) continue
    freq.set(t.normalized, (freq.get(t.normalized) ?? 0) + 1)
  }
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => ({ word: key, count }))

  return {
    words,
    sentences,
    avgWordsPerSentence: sentences > 0 ? Math.round((words / sentences) * 10) / 10 : 0,
    durationMinutes: estimateDurationMinutes(words, wpm),
    keywords,
  }
}

export const FILLER_LABELS = FILLER_LABEL
