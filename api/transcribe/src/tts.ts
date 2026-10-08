export interface TtsEnv {
  GEMINI_API_KEY?: string
  GEMINI_TTS_MODEL?: string
  GEMINI_TTS_VOICE?: string
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
export const TTS_TIMEOUT_MS = 90_000

export function ttsHealth(env: TtsEnv) {
  return {
    provider: 'gemini',
    configured: Boolean(env.GEMINI_API_KEY?.trim()),
    model: env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-lite-tts',
    voice: env.GEMINI_TTS_VOICE?.trim() || 'Kore',
  }
}

function failure(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

// Reject empty/truncated files before spending the user's monthly allowance.
function wavBytes(data: string): Uint8Array<ArrayBuffer> {
  if (!data || data.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) throw new Error('Audio size')
  const binary = atob(data)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('Invalid WAV')
  let format = false
  let audio = false
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true)
    const end = offset + 8 + size
    if (end > bytes.length) throw new Error('Truncated WAV')
    if (tag(offset) === 'fmt ') {
      format = size >= 16 && view.getUint16(offset + 8, true) === 1
        && view.getUint16(offset + 10, true) === 1
        && view.getUint32(offset + 12, true) === 24000
        && view.getUint16(offset + 22, true) === 16
    }
    if (tag(offset) === 'data') audio = size > 0 && size % 2 === 0
    offset = end + (size % 2)
  }
  if (!format || !audio) throw new Error('Missing PCM audio')
  return bytes
}

/** One synthesis request; no paid fallback or automatic retries on quota errors. */
export async function generateSpeech(request: Request, env: TtsEnv): Promise<Response> {
  let input: { text?: unknown; lang?: unknown } | null
  try { input = await request.json() } catch { return failure('Envie um texto válido para a narração.', 400) }
  if (!input || typeof input.text !== 'string' || !input.text.trim()) return failure('Digite o texto da narração.', 400)
  if (input.text.length > 5_000) return failure('Texto acima do limite de 5.000 caracteres.', 413)
  if (input.lang !== undefined && (typeof input.lang !== 'string' || !/^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(input.lang))) return failure('Idioma inválido.', 400)
  const config = ttsHealth(env)
  if (!config.configured) return failure('A geração de voz ainda não está configurada. Use “Ouvir texto” para ensaiar.', 503)
  if (request.signal.aborted) return failure('Geração de voz cancelada.', 499)
  const controller = new AbortController()
  const cancel = () => controller.abort()
  request.signal.addEventListener('abort', cancel, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, TTS_TIMEOUT_MS)
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY!.trim() },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        // Gemini detects the language from the literal transcript, without reading instructions.
        input: [{ type: 'user_input', content: [{ type: 'text', text: input.text.trim() }] }],
        response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: config.voice }] },
        store: false,
        stream: false,
      }),
    })
    if (!upstream.ok) {
      await upstream.body?.cancel()
      if (upstream.status === 429) return failure('O limite de geração de voz foi atingido. Tente mais tarde ou use “Ouvir texto” para ensaiar.', 429)
      if (upstream.status === 400 || upstream.status === 422) return failure('Não foi possível narrar este texto. Revise o conteúdo e tente novamente.', 422)
      return failure('A geração de voz está temporariamente indisponível. Tente mais tarde.', 503)
    }
    const result = await upstream.json() as { status?: string; steps?: { type?: string; content?: { type?: string; mime_type?: string; data?: string }[] }[] }
    if (controller.signal.aborted) throw new Error('Aborted')
    if (result.status !== 'completed' || !Array.isArray(result.steps)) throw new Error('Incomplete audio')
    const chunks = result.steps.filter((step) => step?.type === 'model_output')
      .flatMap((step) => Array.isArray(step.content) ? step.content : []).filter((item) => item?.type === 'audio')
    if (chunks.length !== 1 || chunks[0].mime_type !== 'audio/wav' || typeof chunks[0].data !== 'string') throw new Error('Missing audio')
    return new Response(wavBytes(chunks[0].data), {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
    })
  } catch {
    if (request.signal.aborted) return failure('Geração de voz cancelada.', 499)
    if (timedOut) return failure('A geração de voz demorou demais. Tente novamente com um texto menor.', 504)
    return failure('Não foi possível gerar um áudio completo. Tente novamente mais tarde.', 503)
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancel)
  }
}
