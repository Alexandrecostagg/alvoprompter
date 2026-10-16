export interface TranscriptWord { word: string; start: number; end: number }
interface Transcript { text: string; words: TranscriptWord[] }
interface TranscriptionEnv {
  GROQ_API_KEY?: string
  AI: { run(model: string, input: unknown): Promise<unknown> }
}
export function normalizeTranscript(value: unknown): Transcript {
  const result = value as { text?: unknown; words?: unknown; segments?: { words?: unknown }[] } | null
  const raw = Array.isArray(result?.words) ? result.words : Array.isArray(result?.segments) ? result.segments.flatMap(s => Array.isArray(s.words) ? s.words : []) : []
  const words: TranscriptWord[] = []
  for (const item of raw) {
    if (!item || typeof item.word !== 'string' || !item.word.trim() || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end < item.start || item.start < (words.at(-1)?.start ?? 0)) return { text: typeof result?.text === 'string' ? result.text : '', words: [] }
    words.push({ word: item.word.trim(), start: item.start, end: item.end })
  }
  return { text: typeof result?.text === 'string' ? result.text : '', words }
}
export async function transcribeWithTimestamps(audio: File, language: string, env: TranscriptionEnv, signal: AbortSignal): Promise<Transcript> {
  signal.throwIfAborted()
  if (env.GROQ_API_KEY?.trim()) {
    try {
      const form = new FormData()
      form.set('file', audio, audio.name)
      form.set('model', 'whisper-large-v3-turbo')
      form.set('language', language.split('-')[0]!)
      form.set('response_format', 'verbose_json')
      form.append('timestamp_granularities[]', 'word')
      form.append('timestamp_granularities[]', 'segment')
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY.trim()}` }, body: form,
        signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
      })
      if (response.ok) {
        const result = normalizeTranscript(await response.json())
        if (result.words.length || !result.text.trim()) return result
      }
    } catch { signal.throwIfAborted() }
  }
  const bytes = new Uint8Array(await audio.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const result = normalizeTranscript(await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
    audio: btoa(binary), task: 'transcribe', language: language.split('-')[0],
  }))
  signal.throwIfAborted()
  return result
}
