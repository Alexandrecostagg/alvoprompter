import { RequestError, readLimited, secureResponse, takeRateLimit, fetchImport, importAllowed, cleanupRateLimits } from './security'
import { billingAvailability } from './billing'
import { appleBillingConfigured } from './appleBilling'
import { cascadeChat, chatHealth, type ChatEnv } from './chat'
import { generateSpeech, ttsHealth, type TtsEnv } from './tts'
/**
 * AlvoPrompter API — Cloudflare Worker com Gemini, Groq e Workers AI.
 *
 * Endpoints:
 *   POST /transcribe  multipart: audio=<arquivo>, lang=<código ISO>  → { result: { text, words } }
 *   POST /tts         JSON: { text, lang }                            → áudio WAV (Gemini TTS)
 *   POST /translate   JSON: { text, sourceLang, targetLang }          → { translated_text }
 *   POST /import-url  JSON: { url }                                   → { text, title } (YouTube/GDocs/URL genérica)
 *   POST /avatar      JSON: { prompt }                                → imagem PNG (Flux)
 *   PUT/GET/DELETE /media/:key (R2)
 *   GET/PUT /sync     Header "x-sync-pass"; PUT body { scripts }      → sync de roteiros (KV)
 *   GET/PUT /schedules   Header "x-sync-pass"; body { posts }         → sync de agendamentos (KV)
 *   GET/PUT /workspaces  Header "x-sync-pass"; body { workspaces }    → sync de workspaces (KV)
 *
 * Uso local:  npx wrangler dev --port 8787
 * Publicar:   npx wrangler deploy
 */
import { authorizeAiAction, refundAiAction, handleSaaSRequest, replayAsaasWebhookEvent, requireUser, type SaaSEnv, type AiCharge } from './saas'

export interface Env extends ChatEnv, TtsEnv {
  AI: {
    run(model: string, input: unknown, options?: { returnRawResponse?: boolean }): Promise<unknown>
  }
  alvoprompt_media: R2Bucket
  ALVOPROMPT_SYNC: KVNamespace
  CORS_ORIGIN?: string
  PEXELS_API_KEY?: string
  IMPORT_ALLOWED_HOSTS?: string
  RELEASE?: string
  DB?: D1Database
  BILLING_QUEUE?: Queue<{ id: string }>
  FIREBASE_PROJECT_ID?: string
  ASAAS_API_KEY?: string
  ASAAS_PRODUCTION_API_KEY?: string
  ASAAS_API_BASE?: string
  ASAAS_WEBHOOK_TOKEN?: string
  APPLE_IAP_ISSUER_ID?: string
  APPLE_IAP_KEY_ID?: string
  APPLE_IAP_PRIVATE_KEY?: string
  APP_URL?: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sync-pass',
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_MEDIA_BYTES = 100 * 1024 * 1024
const MIN_SYNC_PASS_LENGTH = 12

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  const allowed = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return allowed.includes(origin)
}

async function enforceRateLimit(
  request: Request,
  env: Env,
  bucket: string,
  dailyLimit: number,
): Promise<Response | null> {
  if (env.DB) return await takeRateLimit(env.DB, `daily:${bucket}:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, dailyLimit, 86400) ? null : json({ error: 'Limite diário atingido. Tente novamente amanhã.' }, 429)
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  const day = new Date().toISOString().slice(0, 10)
  const key = `rate:${bucket}:${day}:${ip}`
  const count = Number((await env.ALVOPROMPT_SYNC.get(key)) ?? '0')
  if (count >= dailyLimit) {
    return json({ error: 'Limite diário atingido. Tente novamente amanhã.' }, 429)
  }
  await env.ALVOPROMPT_SYNC.put(key, String(count + 1), { expirationTtl: 60 * 60 * 25 })
  return null
}

function requestTooLarge(request: Request, maxBytes: number): boolean {
  const size = Number(request.headers.get('Content-Length') ?? '0')
  return Number.isFinite(size) && size > maxBytes
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

async function syncKey(pass: string, prefix = 'sync'): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}:${hex}`
}

function videoPageKey(id: string): string {
  return `vpage:${id.toLowerCase()}`
}

/**
 * Sync genérico de coleções no KV, protegido pela frase-chave (x-sync-pass).
 * GET  → { [field]: [...] }
 * PUT  → { [field]: [...] } (sanitizado antes de salvar)
 * prefixo diferente por tipo (sync/schedules/workspaces) para não misturar dados.
 */
async function handleCollection(
  request: Request,
  kv: KVNamespace,
  prefix: string,
  field: string,
  sanitize: (rec: Record<string, unknown>) => Record<string, unknown>,
  uid: string,
): Promise<Response> {
  const pass = (request.headers.get('x-sync-pass') ?? '').trim()
  if (pass.length < MIN_SYNC_PASS_LENGTH) {
    return json({ error: `Frase-chave muito curta (mínimo ${MIN_SYNC_PASS_LENGTH} caracteres).` }, 400)
  }
  const key = await syncKey(JSON.stringify([uid, pass]), prefix)

  if (request.method === 'GET') {
    const raw = await kv.get(key)
    if (!raw) return json({ [field]: [] })
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return json({ [field]: Array.isArray(parsed[field]) ? parsed[field] : [] })
    } catch {
      return json({ [field]: [] })
    }
  }

  if (request.method === 'PUT') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const items = body?.[field]
    if (!Array.isArray(items)) {
      return json({ error: `Corpo deve ser { ${field}: [...] }.` }, 400)
    }
    if (items.length > 500) return json({ error: 'Limite de 500 itens por sincronização.' }, 413)
    const sanitized = items.map((s) => sanitize((s ?? {}) as Record<string, unknown>))
    await kv.put(key, JSON.stringify({ [field]: sanitized }), {
      expirationTtl: 60 * 60 * 24 * 90,
    })
    return json({ ok: true, count: sanitized.length })
  }

  return json({ error: 'Método não permitido.' }, 405)
}

function sanitizePost(rec: Record<string, unknown>): Record<string, unknown> {
  return {
    key: typeof rec.key === 'string' && rec.key ? rec.key : crypto.randomUUID(),
    title: typeof rec.title === 'string' ? rec.title : '',
    description: typeof rec.description === 'string' ? rec.description : '',
    channels: Array.isArray(rec.channels) ? rec.channels.filter((c) => typeof c === 'string') : [],
    scheduledAt: typeof rec.scheduledAt === 'number' ? rec.scheduledAt : Date.now(),
    status:
      typeof rec.status === 'string' && ['scheduled', 'published', 'cancelled', 'failed'].includes(rec.status)
        ? rec.status
        : 'scheduled',
    mediaName: typeof rec.mediaName === 'string' ? rec.mediaName : '',
    mediaType: typeof rec.mediaType === 'string' ? rec.mediaType : '',
    scriptTitle: typeof rec.scriptTitle === 'string' ? rec.scriptTitle : '',
    tags: Array.isArray(rec.tags) ? rec.tags.filter((t) => typeof t === 'string') : [],
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
    updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
  }
}

function sanitizeWorkspace(rec: Record<string, unknown>): Record<string, unknown> {
  const members = Array.isArray(rec.members)
    ? (rec.members as Record<string, unknown>[]).map((m) => ({
        name: typeof m.name === 'string' ? m.name : 'Membro',
        email: typeof m.email === 'string' ? m.email : '',
        role:
          typeof m.role === 'string' && ['owner', 'admin', 'editor', 'viewer'].includes(m.role)
            ? m.role
            : 'viewer',
      }))
    : []
  const bk = (rec.brandKit ?? {}) as Record<string, unknown>
  const brandKit =
    typeof bk.name === 'string' && bk.name
      ? {
          name: bk.name,
          logoDataUrl: typeof bk.logoDataUrl === 'string' ? bk.logoDataUrl : '',
          primaryColor: typeof bk.primaryColor === 'string' ? bk.primaryColor : '#8B5CF6',
          accentColor: typeof bk.accentColor === 'string' ? bk.accentColor : '#22D3EE',
          fontFamily: typeof bk.fontFamily === 'string' ? bk.fontFamily : '',
        }
      : undefined
  return {
    key: typeof rec.key === 'string' && rec.key ? rec.key : crypto.randomUUID(),
    name: typeof rec.name === 'string' ? rec.name : 'Workspace',
    myRole:
      typeof rec.myRole === 'string' && ['owner', 'admin', 'editor', 'viewer'].includes(rec.myRole)
        ? rec.myRole
        : 'viewer',
    members,
    brandKit,
    createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
    updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
  }
}

function youtubeVideoId(target: string): string | null {
  const u = new URL(target)
  if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname)) {
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] ?? null
    return u.searchParams.get('v')
  }
  return null
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function htmlToText(html: string): string {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
  t = t.replace(/<[^>]+>/g, ' ')
  t = decodeXmlEntities(t)
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return t
}

async function extractYouTubeTranscript(target: string): Promise<{ text: string; title: string }> {
  const id = youtubeVideoId(target)
  if (!id) throw new Error('Não consegui identificar o vídeo do YouTube.')

  const attempts: { url: string; headers: Record<string, string> }[] = [
    {
      url: `https://www.youtube.com/watch?v=${id}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    },
    {
      url: `https://m.youtube.com/watch?v=${id}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    },
  ]

  let html = ''
  for (const attempt of attempts) {
    const res = await fetchImport(attempt.url, { headers: attempt.headers })
    if (res.ok) {
      html = await res.text()
      break
    }
  }
  if (!html) {
    throw new Error('O YouTube não respondeu (limitou o acesso do servidor). Tente de novo em instantes.')
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/)
  const title = titleMatch ? titleMatch[1].replace(/- YouTube$/, '').trim() : 'YouTube'

  const tracksMatch = html.match(/"captionTracks":(\[[\s\S]*?\])/)
  if (!tracksMatch) {
    throw new Error('Esse vídeo não tem legendas publicadas (ou as legendas estão desabilitadas).')
  }
  let tracks: { baseUrl?: string; languageCode?: string; name?: { simpleText?: string } }[]
  try {
    tracks = JSON.parse(tracksMatch[1])
  } catch {
    throw new Error('Não consegui ler as legendas desse vídeo.')
  }
  if (!tracks.length) throw new Error('Esse vídeo não tem legendas publicadas.')

  const preferred = tracks.find((t) => (t.languageCode ?? '').toLowerCase().startsWith('pt'))
  const track = preferred ?? tracks[0]
  const baseUrl = track?.baseUrl
  if (!baseUrl) throw new Error('Legendas indisponíveis para esse vídeo.')

  const captionsRes = await fetchImport(baseUrl.replace(/\\u0026/g, '&'))
  if (!captionsRes.ok) throw new Error('Falha ao baixar as legendas (HTTP ' + captionsRes.status + ').')
  const xml = await captionsRes.text()

  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
  if (!segments.length) throw new Error('As legendas estão vazias.')
  const text = segments
    .map((m) => decodeXmlEntities(m[1] ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  if (!text) throw new Error('As legendas estão vazias.')
  return { text, title }
}

async function extractGoogleDocs(target: string): Promise<{ text: string; title: string }> {
  const u = new URL(target)
  const m = u.pathname.match(/\/d\/([^/]+)/)
  if (!m) throw new Error('Link de Google Docs inválido. Use um link de documento (docs.google.com/document/d/...).')
  const id = m[1]!
  const exportRes = await fetchImport(
    `https://docs.google.com/document/d/${id}/export?format=txt`,
    { headers: { 'Accept-Language': 'pt-BR,pt;q=0.8' } },
  )
  if (!exportRes.ok) {
    throw new Error(
      'Não consegui abrir o documento. Confira se o link é público ou tem "qualquer pessoa com o link" habilitado.',
    )
  }
  const text = (await exportRes.text()).trim()
  if (!text) throw new Error('O documento está vazio.')
  return { text, title: `Google Docs ${id.slice(0, 8)}` }
}

async function extractGenericText(target: string, allowedHosts = ''): Promise<{ text: string; title: string }> {
  const res = await fetchImport(target, {
    headers: { 'User-Agent': 'Mozilla/5.0 AlvoPrompter', 'Accept-Language': 'pt-BR,pt;q=0.8' },
  }, allowedHosts)
  if (!res.ok) throw new Error(`Falha ao buscar o link (HTTP ${res.status}).`)
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/pdf')) {
    throw new Error('PDFs devem ser importados como arquivo nesta versão.')
  }
  let text = (await res.text()).trim()
  if (!text) throw new Error('O link retornou conteúdo vazio.')
  if (contentType.includes('text/html') || /^</.test(text)) {
    text = htmlToText(text)
    if (!text) throw new Error('O link não contém texto legível.')
  }
  return { text, title: uTitle(target) }
}

function uTitle(target: string): string {
  try {
    const u = new URL(target)
    return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') || u.hostname
  } catch {
    return 'Importado de link'
  }
}

// ---- Proteção contra SSRF no importador de URLs ----
// Bloqueia endereços privados/loopback/metadata para que o Worker não seja
// usado como proxy para a rede interna (10.x, 172.16/12, 192.168, 127.x,
// link-local, CGNAT, IPv6 literal e hostnames internos comuns).
function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  )
}

function importUrlBlocked(target: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return 'URL inválida.'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Somente URLs http(s) são aceitas.'
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (host.includes(':')) return 'Endereços IPv6 não são aceitos na importação.'
  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host === 'metadata' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return 'Endereço interno não pode ser importado.'
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && ipv4IsPrivate(host)) {
    return 'Endereço privado não pode ser importado.'
  }
  return null
}

const api = {
  async fetch(request: Request, env: Env, uid?: string): Promise<Response> {
    if (!allowedOrigin(request, env)) return json({ error: 'Origem não autorizada.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    const url = new URL(request.url)


    const saasResponse = await handleSaaSRequest(request, env as Env & SaaSEnv)
    if (saasResponse) return saasResponse

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        status: 'ok',
        service: 'AlvoPrompter API',
        release: env.RELEASE || 'development',
        protocol: 2,
        ai: chatHealth(env),
        tts: ttsHealth(env),
        auth: { projectId: env.FIREBASE_PROJECT_ID || null, configured: Boolean(env.FIREBASE_PROJECT_ID && !env.FIREBASE_PROJECT_ID.startsWith('configure-')) },
        billing: billingAvailability(env),
        appleBilling: { configured: appleBillingConfigured(env) },
        workersAi: { configured: Boolean(env.AI) },
      })
    }


    if (url.pathname === '/broll' && request.method === 'GET') {
      if (!env.PEXELS_API_KEY) return json({ error: 'A busca de clipes está temporariamente indisponível. Use um vídeo do aparelho.' }, 503)
      const query = url.searchParams.get('query')?.trim() ?? ''
      if (!query || query.length > 200) return json({ error: 'Informe uma busca com até 200 caracteres.' }, 400)
      const params = new URLSearchParams({ query, orientation: 'landscape', per_page: String(Math.min(24, Math.max(1, Number(url.searchParams.get('per_page')) || 12))) })
      const result = await fetch(`https://api.pexels.com/videos/search?${params}`, {
        headers: { Authorization: env.PEXELS_API_KEY }, signal: AbortSignal.timeout(10_000), redirect: 'error',
      })
      if (!result.ok) return json({ error: 'Não foi possível buscar clipes agora.' }, 502)
      const bytes = await readLimited(result.body, 2 * 1024 * 1024)
      return json(JSON.parse(new TextDecoder().decode(bytes)))
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'chat', 100)
      if (limited) return limited
      if (requestTooLarge(request, 128 * 1024)) return json({ error: 'Solicitação muito grande.' }, 413)
      const input = (await request.json().catch(() => null)) as {
        messages?: { role?: string; content?: string }[]
        temperature?: number
        max_tokens?: number
        response_format?: { type?: string }
      } | null
      if (!Array.isArray(input?.messages) || !input.messages.length || input.messages.length > 30 || input.messages.some((message) => !message || typeof message.content !== 'string')) {

        return json({ error: 'Conversa inválida.' }, 400)
      }
      const messages = input.messages.map((message) => ({
        role: ['system', 'user', 'assistant'].includes(message.role ?? '') ? message.role! : 'user',
        content: String(message.content ?? '').slice(0, 20_000),
      }))
      const response = await cascadeChat({
        messages,
        temperature: Number.isFinite(input.temperature) ? Math.min(1.5, Math.max(0, input.temperature!)) : 0.7,
        // Leave room for reasoning as well as the spoken script, as in the existing endpoint.
        max_tokens: 8_000,
        ...(input.response_format?.type === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
      }, env, request.signal)
      const headers = new Headers(response.headers)
      for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
      return new Response(response.body, { status: response.status, headers })
    }

    if (url.pathname === '/transcribe' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'transcribe', 20)
      if (limited) return limited
      if (requestTooLarge(request, MAX_AUDIO_BYTES + 1024 * 1024)) return json({ error: 'Áudio acima do limite de 25 MB.' }, 413)
      const form = await request.formData()
      const audio = form.get('audio')
      const lang = form.get('lang') ?? 'pt'
      if (typeof lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,8})?$/.test(lang)) return json({ error: 'Idioma inválido.' }, 400)
      if (!(audio instanceof File)) return json({ error: 'Campo "audio" ausente.' }, 400)
      if (audio.size > MAX_AUDIO_BYTES) return json({ error: 'Áudio acima do limite de 25 MB.' }, 413)
      const bytes = new Uint8Array(await audio.arrayBuffer())
      try {
        const result = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
          audio: bytesToBase64(bytes),
          task: 'transcribe',
          language: lang,
          timestamp_granularities: ['word'],
        })) as {
          text: string
          segments?: {
            start: number
            end: number
            words?: { word: string; start: number; end: number }[]
          }[]
        }
        const words = (result.segments ?? []).flatMap((s) => s.words ?? [])
        return json({ result: { text: result.text ?? '', words } })
      } catch {
        return json({ error: 'O serviço não conseguiu concluir a operação. Tente novamente.' }, 502)
      }
    }

    if (url.pathname === '/tts' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'tts', 50)
      if (limited) return limited
      const response = await generateSpeech(request, env)
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value)
      return new Response(response.body, { status: response.status, headers })
    }

    if (url.pathname === '/translate' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'translate', 100)
      if (limited) return limited
      const { text, sourceLang, targetLang } = (await request.json()) as {
        text?: string
        sourceLang?: string
        targetLang?: string
      }
      if (typeof text !== 'string' || typeof targetLang !== 'string' || !text || !/^[a-z]{2,3}(-[A-Za-z]{2,8})?$/.test(targetLang) || (sourceLang !== undefined && (typeof sourceLang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,8})?$/.test(sourceLang)))) return json({ error: 'Campos "text" e "targetLang" obrigatórios.' }, 400)
      if (text.length > 15_000) return json({ error: 'Texto acima do limite de 15.000 caracteres.' }, 413)
      try {
        const result = (await env.AI.run('@cf/meta/m2m100-1.2b', {
          text,
          source_lang: sourceLang ?? 'pt',
          target_lang: targetLang,
        })) as { translated_text?: string }
        return json({ result })
      } catch {
        return json({ error: 'O serviço não conseguiu concluir a operação. Tente novamente.' }, 502)
      }
    }

    if (url.pathname === '/import-url' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'import', 60)
      if (limited) return limited
      const { url: target } = (await request.json()) as { url?: string }
      if (typeof target !== 'string' || !target) return json({ error: 'Campo "url" ausente.' }, 400)
      if (target.length > 2_048) return json({ error: 'URL acima do limite permitido.' }, 413)
      const blocked = importUrlBlocked(target) || (!importAllowed(target, env.IMPORT_ALLOWED_HOSTS) ? 'Este domínio não está habilitado para importação. Importe o texto como arquivo.' : null)
      if (blocked) return json({ error: blocked }, 400)
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        return json({ error: 'URL inválida.' }, 400)
      }
      try {
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
          return json({ result: await extractYouTubeTranscript(target) })
        }
        if (parsed.hostname === 'docs.google.com') {
          return json({ result: await extractGoogleDocs(target) })
        }
        return json({ result: await extractGenericText(target, env.IMPORT_ALLOWED_HOSTS) })
      } catch (err) {
        return json({ error: err instanceof RequestError ? err.message : 'Não foi possível importar o link. Confira se ele é público e tente novamente.' }, err instanceof RequestError ? err.status : 502)
      }
    }

    if (url.pathname === '/avatar' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'avatar', 10)
      if (limited) return limited
      const { prompt } = (await request.json()) as { prompt?: string }
      if (typeof prompt !== 'string' || !prompt) return json({ error: 'Campo "prompt" ausente.' }, 400)
      if (prompt.length > 800) return json({ error: 'Descrição acima do limite de 800 caracteres.' }, 413)
      try {
        const result = (await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
          prompt: `${prompt}, retrato profissional em estúdio, iluminação suave, alta qualidade`,
          steps: 4,
        })) as { image?: ArrayBuffer | number[] | string }
        let bytes: ArrayBuffer
        if (typeof result.image === 'string') {
          const bin = atob(result.image)
          const arr = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
          bytes = arr.buffer
        } else if (Array.isArray(result.image)) {
          bytes = new Uint8Array(result.image).buffer
        } else if (result.image instanceof ArrayBuffer) {
          bytes = result.image
        } else {
          throw new Error('O modelo de imagem não retornou dados.')
        }
        const head = new Uint8Array(bytes.slice(0, 4))
        const isPng =
          head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
        return new Response(bytes, {
          headers: { 'Content-Type': isPng ? 'image/png' : 'image/jpeg', ...CORS_HEADERS },
        })
      } catch {
        return json({ error: 'O serviço não conseguiu concluir a operação. Tente novamente.' }, 502)
      }
    }

    // ---- Sync de roteiros (KV, protegido por frase-chave) ----
    if (url.pathname === '/sync') {
      const syncLimited = await enforceRateLimit(request, env, 'sync', 1000)
      if (syncLimited) return syncLimited
      const pass = (request.headers.get('x-sync-pass') ?? '').trim()
      if (pass.length < MIN_SYNC_PASS_LENGTH) {
        return json({ error: `Frase-chave muito curta (mínimo ${MIN_SYNC_PASS_LENGTH} caracteres).` }, 400)
      }
      const key = await syncKey(JSON.stringify([uid, pass]))

      if (request.method === 'GET') {
        const raw = await env.ALVOPROMPT_SYNC.get(key)
        if (!raw) return json({ scripts: [] })
        try {
          const parsed = JSON.parse(raw) as { scripts?: unknown }
          return json({ scripts: Array.isArray(parsed.scripts) ? parsed.scripts : [] })
        } catch {
          return json({ scripts: [] })
        }
      }

      if (request.method === 'PUT') {
        const body = (await request.json().catch(() => null)) as { scripts?: unknown } | null
        const scripts = body?.scripts
        if (!Array.isArray(scripts)) {
          return json({ error: 'Corpo deve ser { scripts: [...] }.' }, 400)
        }
        if (scripts.length > 500) return json({ error: 'Limite de 500 roteiros por sincronização.' }, 413)
        const sanitized = scripts.map((s) => {
          const rec = (s ?? {}) as Record<string, unknown>
          return {
            key: typeof rec.key === 'string' && rec.key ? rec.key : crypto.randomUUID(),
            title: typeof rec.title === 'string' ? rec.title : '',
            content: typeof rec.content === 'string' ? rec.content : '',
            tags: Array.isArray(rec.tags) ? rec.tags.filter((t) => typeof t === 'string') : [],
            createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
            updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
          }
        })
        await env.ALVOPROMPT_SYNC.put(key, JSON.stringify({ scripts: sanitized }), {
          expirationTtl: 60 * 60 * 24 * 90,
        })
        return json({ ok: true, count: sanitized.length })
      }

      return json({ error: 'Método não permitido em /sync.' }, 405)
    }

    // ---- Sync de agendamentos e workspaces (KV, mesma frase-chave) ----
    if (url.pathname === '/schedules') {
      const limited = await enforceRateLimit(request, env, 'schedules', 500)
      if (limited) return limited
      return handleCollection(request, env.ALVOPROMPT_SYNC, 'schedules', 'posts', sanitizePost, uid!)
    }
    if (url.pathname === '/workspaces') {
      const limited = await enforceRateLimit(request, env, 'workspaces', 500)
      if (limited) return limited
      return handleCollection(
        request,
        env.ALVOPROMPT_SYNC,
        'workspaces',
        'workspaces',
        sanitizeWorkspace,
        uid!,
      )
    }

    // ---- Páginas de vídeo (landing pública para compartilhamento) ----
    const videoPageMatch = url.pathname.match(/^\/videopages\/([a-f0-9-]{36})(?:\/(play))?$/i)
    if (videoPageMatch) {
      const id = videoPageMatch[1]!.toLowerCase()
      const pageKey = videoPageKey(id)
      const isPlay = Boolean(videoPageMatch[2])

      if (request.method === 'GET' && isPlay) {
        // --- Reprodução pública (aumenta contador de visualizações) ---
        const pageRaw = await env.ALVOPROMPT_SYNC.get(pageKey)
        if (!pageRaw) return json({ error: 'Página de vídeo não encontrada.' }, 404)
        let page: Record<string, unknown> | null = null
        try {
          page = JSON.parse(pageRaw) as Record<string, unknown>
        } catch {
          return json({ error: 'Página de vídeo inválida.' }, 500)
        }
        const mediaHash = String(page.passHash ?? '')
        const mediaKey = String(page.mediaKey ?? '')
        if (!mediaHash || !mediaKey) return json({ error: 'Vídeo não localizado.' }, 404)
        const object = await env.alvoprompt_media.get(`${mediaHash.startsWith('media:') ? mediaHash : `media:${mediaHash}`}:${mediaKey}`)
        if (!object) return json({ error: 'Vídeo não encontrado.' }, 404)
        const headers = new Headers(CORS_HEADERS)
        object.writeHttpMetadata(headers)
        headers.set('Content-Type', object.httpMetadata?.contentType ?? 'video/webm')
        headers.set('Accept-Ranges', 'bytes')
        const views = Number(page.views ?? 0) + 1
        await env.ALVOPROMPT_SYNC.put(
          pageKey,
          JSON.stringify({ ...page, views }),
          { metadata: { updated: new Date().toISOString() } },
        )
        return new Response(object.body, { headers })
      }

      if (request.method === 'GET') {
        // --- Metadados públicos da página ---
        const pageRaw = await env.ALVOPROMPT_SYNC.get(pageKey)
        if (!pageRaw) return json({ error: 'Página de vídeo não encontrada.' }, 404)
        let page: Record<string, unknown> | null = null
        try {
          page = JSON.parse(pageRaw) as Record<string, unknown>
        } catch {
          return json({ error: 'Página de vídeo inválida.' }, 500)
        }
        return json({
          id: page.id,
          title: page.title ?? '',
          description: page.description ?? '',
          author: page.author ?? '',
          createdAt: page.createdAt ?? '',
          videoUrl: `/videopages/${page.id}/play`,
          views: Number(page.views ?? 0),
        })
      }
    }

    if (url.pathname === '/videopages' && request.method === 'POST') {
      let author = ''
      try {
        const user = await requireUser(request, env as Env & SaaSEnv)
        author = user.name
      } catch (error) {
        return json({ error: (error as Error).message }, 401)
      }
      const pass = (request.headers.get('x-sync-pass') ?? '').trim()
      if (pass.length < MIN_SYNC_PASS_LENGTH) {
        return json({ error: 'Frase-chave obrigatória para criar páginas de vídeo.' }, 401)
      }
      const body = (await request.json().catch(() => null)) as {
        title?: unknown
        description?: unknown
        mediaKey?: unknown
      } | null
      const title = String(body?.title ?? '').trim().slice(0, 200)
      const mediaKey = String(body?.mediaKey ?? '').trim()
      if (!title || !mediaKey || !/^[a-zA-Z0-9._-]{1,128}$/.test(mediaKey)) {
        return json({ error: 'Título e arquivo de vídeo são obrigatórios.' }, 400)
      }
      const media = await env.alvoprompt_media.head(`${await syncKey(JSON.stringify([uid, pass]), 'media')}:${mediaKey}`)
      if (!media || !media.httpMetadata?.contentType?.startsWith('video/')) return json({ error: 'Envie um vídeo da sua conta antes de criar a página.' }, 400)
      const id = crypto.randomUUID()
      const page = {
        id,
        title,
        description: String(body?.description ?? '').trim().slice(0, 500),
        author,
        mediaKey,
        passHash: await syncKey(JSON.stringify([uid, pass]), 'media'),
        createdAt: new Date().toISOString(),
        views: 0,
      }
      await env.ALVOPROMPT_SYNC.put(videoPageKey(id), JSON.stringify(page))
      return json({
        id,
        title: page.title,
        description: page.description,
        author: page.author,
        createdAt: page.createdAt,
        videoUrl: `/videopages/${id}/play`,
        views: 0,
      })
    }

    // ---- Armazenamento de mídia no R2 ----
    const mediaMatch = url.pathname.match(/^\/media\/(.+)$/)
    if (mediaMatch) {
      const mediaLimited = await enforceRateLimit(request, env, 'media', 2000)
      if (mediaLimited) return mediaLimited
      const pass = (request.headers.get('x-sync-pass') ?? '').trim()
      if (pass.length < MIN_SYNC_PASS_LENGTH) return json({ error: 'Frase-chave obrigatória para acessar mídia.' }, 401)
      const rawKey = decodeURIComponent(mediaMatch[1]!)
      if (!/^[a-zA-Z0-9._-]{1,128}$/.test(rawKey)) return json({ error: 'Chave de mídia inválida.' }, 400)
      const key = `${await syncKey(JSON.stringify([uid, pass]), 'media')}:${rawKey}`
      if (request.method === 'PUT') {
        if (requestTooLarge(request, MAX_MEDIA_BYTES)) return json({ error: 'Mídia acima do limite de 100 MB.' }, 413)
        const length = Number(request.headers.get('Content-Length'))
        if (!Number.isSafeInteger(length) || length <= 0) return json({ error: 'Informe o tamanho do arquivo para enviar mídia.', code: 'LENGTH_REQUIRED' }, 411)
        const type = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
        if (!['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'image/png', 'image/jpeg', 'image/webp'].includes(type)) return json({ error: 'Tipo de mídia não permitido.' }, 415)
        if (!request.body) return json({ error: 'Arquivo vazio.' }, 400)
        // Cloudflare's fixed-length stream aborts on both overflow and truncation;
        // an incomplete object is not committed to R2.
        const bounded = new FixedLengthStream(length)
        const piping = request.body.pipeTo(bounded.writable)
        const saving = env.alvoprompt_media.put(key, bounded.readable, { httpMetadata: { contentType: type } })
        await Promise.all([piping, saving])
        return json({ ok: true, key: rawKey })
      }
      if (request.method === 'GET') {
        const object = await env.alvoprompt_media.get(key)
        if (!object) return json({ error: 'Arquivo não encontrado.' }, 404)
        const headers = new Headers(CORS_HEADERS)
        object.writeHttpMetadata(headers)
        headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream')
        headers.set('ETag', object.httpEtag)
        headers.set('Content-Disposition', 'attachment')
        return new Response(object.body, { headers })
      }
      if (request.method === 'DELETE') {
        await env.alvoprompt_media.delete(key)
        return json({ ok: true })
      }
      return json({ error: 'Método não permitido.' }, 405)
    }

    return new Response('AlvoPrompter API — use /transcribe | /tts | /translate | /media/:key', {
      headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
    })
  },
}


/** Preserve the monthly allowance when a provider fails or returns an empty stream. */
async function checkChatOutput(stream: ReadableStream<Uint8Array>, charge: AiCharge, env: SaaSEnv) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = false
  const inspect = (line: string) => {
    if (!line.trim().startsWith('data:')) return
    try {
      const event = JSON.parse(line.trim().slice(5).trim())
      if (event.choices?.some((choice: { delta?: { content?: string } }) => choice.delta?.content)) content = true
    } catch { /* SSE comments and [DONE] carry no content. */ }
  }
  try {
    while (!content) {
      const chunk = await reader.read()
      if (chunk.done) { inspect(buffer + decoder.decode()); break }
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) inspect(line)
      if (buffer.length > 128_000) break
    }
  } finally {
    void reader.cancel().catch(() => undefined)
    if (!content) await refundAiAction(charge, env)
  }
}

export default {
  async queue(batch: MessageBatch<{ id: string }>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (await replayAsaasWebhookEvent(env, message.body.id)) message.ack()
        else message.retry({ delaySeconds: 300 })
      } catch { message.retry({ delaySeconds: 300 }) }
    }
  },
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const finish = (response: Response) => secureResponse(response, request, env.CORS_ORIGIN)
    if (!allowedOrigin(request, env)) return finish(json({ error: 'Origem não autorizada.' }, 403))
    if (request.method === 'OPTIONS') return finish(new Response(null, { headers: CORS_HEADERS }))
    const path = new URL(request.url).pathname
    let charge: AiCharge | undefined
    let response: Response
    try {
      const protectedPath = ['/sync', '/schedules', '/workspaces', '/import-url', '/broll'].includes(path)
        || path.startsWith('/media/') || (path === '/videopages' && request.method === 'POST')
      // Limit attempts before JWT verification, database writes or provider calls.
      if (env.DB && path !== '/health') {
        cleanupRateLimits(env.DB, ctx)
        if (!await takeRateLimit(env.DB, `attempt:${request.headers.get('CF-Connecting-IP') ?? 'local'}`, 120)) {
          return finish(json({ error: 'Muitas tentativas. Aguarde um minuto.' }, 429))
        }
      }
      let uid: string | undefined
      if (protectedPath) {
        try { uid = (await requireUser(request, env)).uid }
        catch { return finish(json({ error: 'Entre novamente na sua conta para continuar.' }, 401)) }
        if (!await takeRateLimit(env.DB!, `user:${uid}`, 120)) return finish(json({ error: 'Muitas solicitações. Aguarde um minuto.' }, 429))
      }
      if (request.body && !path.startsWith('/media/')) {
        const max = path === '/transcribe' ? MAX_AUDIO_BYTES + 1024 * 1024 : 1024 * 1024
        if (requestTooLarge(request, max)) throw new RequestError('Conteúdo acima do limite permitido.', 413)
        const bytes = await readLimited(request.body, max)
        if (bytes.length && path !== '/transcribe') {
          const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Envie um objeto JSON válido.', 400)
        }
        request = new Request(request.url, { method: request.method, headers: request.headers, body: bytes, signal: request.signal })
      }
      if (request.method === 'POST' && ['/chat', '/transcribe', '/tts', '/translate', '/avatar'].includes(path)) {
        const blocked = await authorizeAiAction(request, env, (value) => { charge = value })
        if (blocked) return finish(blocked)
      }
      response = await api.fetch(request, env, uid)
    } catch (error) {
      response = json({ error: error instanceof RequestError ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.' }, error instanceof RequestError ? error.status : error instanceof SyntaxError ? 400 : 502)
    }
    if (charge && (!response.ok || !response.body)) {
      try { await refundAiAction(charge, env) } catch { /* No internal database detail reaches the client. */ }
    } else if (charge && path === '/chat' && response.body) {
      const [client, audit] = response.body.tee()
      const verification = checkChatOutput(audit, charge, env).catch(() => undefined)
      ctx?.waitUntil(verification)
      response = new Response(client, response)
    }
    return finish(response)
  },
}
