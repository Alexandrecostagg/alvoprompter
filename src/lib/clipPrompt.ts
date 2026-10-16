/**
 * Parser de comandos em linguagem natural para cortar/formatar o vídeo
 * (estilo "ClipAnything" da OpusClip, mas 100% local e previsível).
 * Ex.: "pega a parte de 1:30 a 2:15", "corte os primeiros 20 segundos",
 *      "remova o silêncio", "deixa 9:16", "adiciona legendas".
 */

export type AspectOption = 'original' | '9:16' | '1:1' | '16:9'

export type ClipPromptAction =
  | { type: 'aspect'; value: AspectOption }
  | { type: 'range'; from: number; to: number }
  | { type: 'trim-start'; seconds: number }
  | { type: 'trim-end'; seconds: number }
  | { type: 'cut-audio' }
  | { type: 'captions' }

export interface ClipPromptResult {
  label: string
  actions: ClipPromptAction[]
}

const ASPECT_WORDS: { re: RegExp; value: AspectOption; label: string }[] = [
  { re: /9\s*[:/]\s*16|vertical|shorts|reels/, value: '9:16', label: 'formato 9:16 (vertical)' },
  { re: /1\s*[:/]\s*1|quadrad[oa]/, value: '1:1', label: 'formato 1:1 (quadrado)' },
  { re: /16\s*[:/]\s*9|horizontal/, value: '16:9', label: 'formato 16:9 (horizontal)' },
  { re: /original|sem cortar/, value: 'original', label: 'formato original' },
]

function toSeconds(token: string): number {
  const t = token.trim().replace(',', '.')
  if (/^\d+:\d{2}$/.test(t)) {
    const [m, s] = t.split(':').map(Number)
    return m! * 60 + s!
  }
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t)
  return NaN
}

function secondsLabel(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round((s % 60) * 100) / 100
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

export function parseClipPrompt(input: string): ClipPromptResult[] {
  const text = input.toLowerCase()
  const results: ClipPromptResult[] = []

  for (const a of ASPECT_WORDS) {
    if (a.re.test(text)) {
      results.push({ label: `Usar ${a.label}`, actions: [{ type: 'aspect', value: a.value }] })
      break
    }
  }

  const rangeMatch = text.match(/(?:de|entre|pega|pegue|trecho|parte)[^\d]*(\d+:\d{2}|\d+(?:[.,]\d+)?)[^\d]*?(?:a|at[eé]|e)[^\d]*(\d+:\d{2}|\d+(?:[.,]\d+)?)/)
  if (rangeMatch) {
    const from = toSeconds(rangeMatch[1]!)
    const to = toSeconds(rangeMatch[2]!)
    if (isFinite(from) && isFinite(to) && to > from) {
      results.push({
        label: `Manter apenas ${secondsLabel(from)} → ${secondsLabel(to)}`,
        actions: [{ type: 'range', from, to }],
      })
    }
  }

  const firstMatch = text.match(/(?:corte|corta|remove|remova|tira|deixa? fora)[^\d]*?primeiros?\s*(\d+(?:[.,]\d+)?)/)
  if (firstMatch) {
    const secs = toSeconds(firstMatch[1]!)
    if (isFinite(secs)) {
      results.push({
        label: `Cortar os primeiros ${secondsLabel(secs)}`,
        actions: [{ type: 'trim-start', seconds: secs }],
      })
    }
  }

  const lastMatch = text.match(/(?:corte|corta|remove|remova|tira|deixa? fora)[^\d]*?[úu]ltimos?\s*(\d+(?:[.,]\d+)?)/)
  if (lastMatch) {
    const secs = toSeconds(lastMatch[1]!)
    if (isFinite(secs)) {
      results.push({
        label: `Cortar os últimos ${secondsLabel(secs)}`,
        actions: [{ type: 'trim-end', seconds: secs }],
      })
    }
  }

  if (/sil[êe]ncio|pausas|gaps|vozes mortas/.test(text)) {
    results.push({
      label: 'Ativar corte automático de silêncio',
      actions: [{ type: 'cut-audio' }],
    })
  }

  if (/legend|legenda|legendar|caption/.test(text)) {
    results.push({
      label: 'Queimar legendas no vídeo',
      actions: [{ type: 'captions' }],
    })
  }

  return results
}
