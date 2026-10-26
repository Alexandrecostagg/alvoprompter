import { requestAiConsent } from './aiConsent'

/**
 * Cliente do Worker Cloudflare (transcrição Whisper, TTS/dublagem e tradução).
 * Por padrão usa o Worker publicado do AlvoPrompter. Para desenvolvimento
 * local, VITE_CLOUDFLARE_API_BASE pode apontar para o `wrangler dev`.
 */
const DEFAULT_BASE = 'https://alvoprompt-api.alexandrecostagg.workers.dev'

async function optionalAuthToken(): Promise<string | null> {
  return (await import('./auth')).getOptionalIdToken()
}

export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface WhisperResult {
  text: string
  words?: WhisperWord[]
}

export function apiBase(): string {
  return (import.meta.env.VITE_CLOUDFLARE_API_BASE as string | undefined) || DEFAULT_BASE
}

async function fetchJson(path: string, init: RequestInit): Promise<unknown> {
  const token = await optionalAuthToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Erro ${res.status} na API`)
  }
  return res.json()
}

export async function transcribeAudio(blob: Blob, lang: string, signal?: AbortSignal): Promise<WhisperResult> {
  await requestAiConsent('transcribe', signal)
  signal?.throwIfAborted()
  const form = new FormData()
  form.append('audio', blob, blob.type.includes('wav') ? 'audio.wav' : blob.type.includes('mp4') ? 'audio.mp4' : 'audio.webm')
  form.append('lang', lang)
  const payload = (await fetchJson('/transcribe', { method: 'POST', body: form, signal })) as {
    result: WhisperResult
  }
  return payload.result
}

export async function speakWithTts(text: string, lang = 'pt'): Promise<Blob> {
  await requestAiConsent('tts')
  const token = await optionalAuthToken()
  const res = await fetch(`${apiBase()}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text, lang }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Erro ${res.status} no TTS`)
  }
  return res.blob()
}

export async function translateCloud(text: string, targetLang: string, sourceLang = 'pt'): Promise<string> {
  await requestAiConsent('translate')
  const payload = (await fetchJson('/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sourceLang, targetLang }),
  })) as { result: { translated_text?: string } }
  return payload.result.translated_text ?? ''
}

export async function fetchRemoteText(url: string): Promise<{ text: string; title: string }> {
  const payload = (await fetchJson('/import-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })) as { result: { text: string; title: string } }
  return payload.result
}

export async function generateAvatar(prompt: string): Promise<Blob> {
  await requestAiConsent('avatar')
  const token = await optionalAuthToken()
  const res = await fetch(`${apiBase()}/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Erro ${res.status} na geração de avatar`)
  }
  return res.blob()
}
