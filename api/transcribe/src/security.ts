/** Shared boundaries; never return upstream exceptions or credentials to clients. */
export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** Container signature only, not a decoder or antivirus. Preserve streaming limits. */
export function mediaSignatureMatches(bytes: Uint8Array, type: string): boolean {
  const ascii = (offset: number, text: string) => bytes.length >= offset + text.length && [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0))
  if (['video/mp4', 'video/quicktime', 'audio/mp4'].includes(type)) return bytes.length >= 12 && ascii(4, 'ftyp')
  if (['video/webm', 'audio/webm'].includes(type)) return [0x1a,0x45,0xdf,0xa3].every((value, i) => bytes[i] === value)
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP')
  if (type === 'audio/wav') return ascii(0, 'RIFF') && ascii(8, 'WAVE')
  if (type === 'audio/mpeg') return ascii(0, 'ID3') || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  return false
}

export async function validatedMediaStream(body: ReadableStream<Uint8Array>, type: string): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  const prefix: Uint8Array[] = []
  let length = 0
  try {
    while (length < 16) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      prefix.push(part.value)
    }
    // Do not copy the whole first chunk: it can contain the entire upload.
    const signature = new Uint8Array(Math.min(length, 16))
    let offset = 0
    for (const chunk of prefix) { const part = chunk.subarray(0, signature.length - offset); signature.set(part, offset); offset += part.length; if (offset === signature.length) break }
    if (!mediaSignatureMatches(signature, type)) throw new RequestError('O conteúdo do arquivo não corresponde ao tipo de mídia informado.', 415)
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
    throw error
  }
  return new ReadableStream<Uint8Array>({
    start(controller) { prefix.forEach(chunk => controller.enqueue(chunk)) },
    async pull(controller) {
      try { const part = await reader.read(); if (part.done) { reader.releaseLock(); controller.close() } else controller.enqueue(part.value) }
      catch (error) { reader.releaseLock(); controller.error(error) }
    },
    async cancel(reason) { try { await reader.cancel(reason) } finally { reader.releaseLock() } },
  })
}

export async function readLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) {
        void reader.cancel().catch(() => undefined)
        throw new RequestError('Conteúdo acima do limite permitido.', 413)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export function secureResponse(response: Response, request: Request, origins = ''): Response {
  const headers = new Headers(response.headers)
  headers.delete('Access-Control-Allow-Origin')
  const origin = request.headers.get('Origin')
  if (origin && origins.split(',').map(s => s.trim()).includes(origin)) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox")
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000')
  return new Response(response.body, { status: response.status, headers })
}

/** Atomic fixed-window limit; KV read/increment is not atomic across Workers. */
export async function takeRateLimit(db: D1Database, key: string, limit: number, seconds = 60, cost = 1): Promise<boolean> {
  if (!Number.isSafeInteger(cost) || cost < 1 || cost > limit) return false
  const now = Math.floor(Date.now() / 1000)
  const window = Math.floor(now / seconds) * seconds
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  const result = await db.prepare(`INSERT INTO security_rate_limits (key, window_start, hits, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start,
      hits = CASE WHEN security_rate_limits.window_start = excluded.window_start THEN security_rate_limits.hits + excluded.hits ELSE excluded.hits END,
      expires_at = excluded.expires_at
    WHERE security_rate_limits.window_start <> excluded.window_start OR security_rate_limits.hits <= ?`)
    .bind(hash, window, cost, window + seconds, limit - cost).run()
  return Boolean(result.meta.changes)
}

const IMPORT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'docs.google.com', 'docs.googleusercontent.com']
export function importAllowed(target: string, additionalHosts = ''): boolean {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ([...IMPORT_HOSTS, ...additionalHosts.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)].includes(url.hostname)
        || /^doc-[a-z0-9-]+-docstext\.googleusercontent\.com$/.test(url.hostname))
  } catch { return false }
}

/** Validate every redirect too. Only operator-approved domains are fetched by the server. */
export async function fetchImport(target: string, init: RequestInit = {}, additionalHosts = ''): Promise<Response> {
  const signal = AbortSignal.timeout(15_000)
  for (let redirect = 0; redirect < 5; redirect++) {
    if (!importAllowed(target, additionalHosts)) throw new RequestError('Este domínio não está habilitado para importação. Importe o texto como arquivo.', 400)
    const response = await fetch(target, { ...init, redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      void response.body?.cancel().catch(() => undefined)
      const location = response.headers.get('Location')
      if (!location) throw new RequestError('O link retornou um redirecionamento inválido.', 400)
      target = new URL(location, target).href
      continue
    }
    const bytes = await readLimited(response.body, 2 * 1024 * 1024)
    return new Response(bytes, { status: response.status, headers: response.headers })
  }
  throw new RequestError('O link tem redirecionamentos demais.', 400)
}

let nextRateCleanup = 0
/** Bounded background maintenance; the account has no spare Cron Trigger. */
export function cleanupRateLimits(db: D1Database, ctx?: ExecutionContext): void {
  if (!ctx || Date.now() < nextRateCleanup) return
  nextRateCleanup = Date.now() + 60 * 60 * 1000
  ctx.waitUntil(db.prepare(`DELETE FROM security_rate_limits WHERE key IN
    (SELECT key FROM security_rate_limits WHERE expires_at < ? LIMIT 500)`)
    .bind(Math.floor(Date.now() / 1000)).run().catch(() => { nextRateCleanup = 0 }))
}
