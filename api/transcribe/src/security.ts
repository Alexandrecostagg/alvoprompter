/** Shared boundaries; never return upstream exceptions or credentials to clients. */
export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
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
export async function takeRateLimit(db: D1Database, key: string, limit: number, seconds = 60): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const window = Math.floor(now / seconds) * seconds
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  const result = await db.prepare(`INSERT INTO security_rate_limits (key, window_start, hits, expires_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start,
      hits = CASE WHEN security_rate_limits.window_start = excluded.window_start THEN security_rate_limits.hits + 1 ELSE 1 END,
      expires_at = excluded.expires_at
    WHERE security_rate_limits.window_start <> excluded.window_start OR security_rate_limits.hits < ?`)
    .bind(hash, window, window + seconds, limit).run()
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
