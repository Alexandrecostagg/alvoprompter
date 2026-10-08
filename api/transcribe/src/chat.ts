export interface ChatEnv {
  GEMINI_API_KEY?: string
  GROQ_API_KEY?: string
  GEMINI_MODEL?: string
  GROQ_MODEL?: string
}

export interface ChatInput {
  messages: { role: string; content: string }[]
  temperature: number
  max_tokens: number
  response_format?: { type: 'json_object' }
}

export function chatProviders(env: ChatEnv) {
  return [
    { name: 'gemini', key: env.GEMINI_API_KEY?.trim(), model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
    { name: 'groq', key: env.GROQ_API_KEY?.trim(), model: env.GROQ_MODEL || 'openai/gpt-oss-120b', url: 'https://api.groq.com/openai/v1/chat/completions' },
  ]
}

export function chatHealth(env: ChatEnv) {
  const providers = chatProviders(env).map(({ name, model, key }) => ({ provider: name, model, configured: Boolean(key) }))
  return { provider: 'gemini', model: providers[0].model, configured: providers.some((p) => p.configured), fallbackReady: providers.every((p) => p.configured), providers }
}

class ProviderFailure extends Error {
  status: number
  retry: boolean
  constructor(status = 502, retry = true) {
    super('AI provider failed')
    this.status = status
    this.retry = retry
  }
}

const encoder = new TextEncoder()
const START_TIMEOUT_MS = 20_000
const IDLE_TIMEOUT_MS = 30_000
const MAX_PRELUDE_BYTES = 128_000
const interrupted = 'A geração foi interrompida. Tente novamente.'
const errorResponse = (message: string, status: number) => new Response(JSON.stringify({ error: message }), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

/** Fail over only before content is delivered: never splice two providers' answers. */
export async function cascadeChat(input: ChatInput, env: ChatEnv, signal: AbortSignal): Promise<Response> {
  const providers = chatProviders(env).filter((provider) => provider.key)
  if (!providers.length) return errorResponse('Serviço de IA não configurado.', 503)
  for (const provider of providers) {
    if (signal.aborted) return errorResponse('Solicitação cancelada.', 499)
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | null = null
    const deadline = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(abort, ms)
    }
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    deadline(START_TIMEOUT_MS)
    try {
      const upstream = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          ...input, model: provider.model, stream: true,
          ...(provider.name === 'gemini' || provider.model.startsWith('openai/gpt-oss-') ? { reasoning_effort: 'low' } : {}),
        }),
        signal: controller.signal,
      })
      if (!upstream.ok) {
        void upstream.body?.cancel().catch(() => undefined)
        throw new ProviderFailure(upstream.status, [401, 402, 403, 404, 408, 429].includes(upstream.status) || upstream.status >= 500)
      }
      if (!upstream.body || !upstream.headers.get('Content-Type')?.includes('text/event-stream')) throw new ProviderFailure()
      reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      const prelude: Uint8Array[] = []
      let bytes = 0
      let buffer = ''
      let hasContent = false
      // The deadline includes headers AND the first content token; keep-alives cannot reset it.
      while (!hasContent) {
        const chunk = await reader.read()
        if (chunk.done) throw new ProviderFailure()
        prelude.push(chunk.value)
        bytes += chunk.value.byteLength
        if (bytes > MAX_PRELUDE_BYTES) throw new ProviderFailure()
        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim().startsWith('data:')) continue
          const data = line.trim().slice(5).trim()
          if (data === '[DONE]') {
            if (!hasContent) throw new ProviderFailure()
            continue
          }
          let event: { error?: { code?: string | number }; choices?: { delta?: { content?: string; refusal?: string }; finish_reason?: string }[] }
          try { event = JSON.parse(data) } catch { throw new ProviderFailure() }
          if (event.error) {
            const code = String(event.error.code ?? '')
            throw new ProviderFailure(502, !/safety|content_filter|policy|blocked/i.test(code))
          }
          if (event.choices?.some((choice) => choice.finish_reason === 'content_filter' || choice.delta?.refusal)) throw new ProviderFailure(422, false)
          if (event.choices?.some((choice) => typeof choice.delta?.content === 'string' && choice.delta.content.length > 0)) hasContent = true
        }
      }
      clearTimeout(timer)
      const streamReader = reader
      const body = new ReadableStream<Uint8Array>({
        start(stream) { for (const chunk of prelude) stream.enqueue(chunk) },
        async pull(stream) {
          deadline(IDLE_TIMEOUT_MS)
          try {
            const chunk = await streamReader.read()
            clearTimeout(timer)
            if (chunk.done) { cleanup(); stream.close() }
            else stream.enqueue(chunk.value)
          } catch {
            cleanup()
            // Existing mobile clients ignore this event; updated clients surface it.
            stream.enqueue(encoder.encode(`\n\ndata: ${JSON.stringify({ error: { message: interrupted } })}\n\n`))
            stream.close()
          }
        },
        cancel() { cleanup(); controller.abort(); return streamReader.cancel().catch(() => undefined) },
      })
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } })
    } catch (error) {
      cleanup()
      controller.abort()
      void reader?.cancel().catch(() => undefined)
      if (signal.aborted) return errorResponse('Solicitação cancelada.', 499)
      const failure = error instanceof ProviderFailure ? error : new ProviderFailure(504)
      // No prompts, responses, keys or raw provider messages in diagnostics.
      console.warn('AI provider unavailable', { provider: provider.name, status: failure.status })
      if (!failure.retry) return errorResponse('A IA não conseguiu atender a este pedido. Revise o texto e tente novamente.', 422)
    }
  }
  return errorResponse('A IA está temporariamente indisponível. Tente novamente em instantes.', 503)
}
