/**
 * AlvoPrompter API — Cloudflare Worker com Workers AI (plano gratuito).
 *
 * Endpoints:
 *   POST /transcribe  multipart: audio=<arquivo>, lang=<código ISO>  → { result: { text, words } }
 *   POST /tts         JSON: { text, lang }                            → áudio (MeloTTS → Grok TTS em PT-BR)
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
import { authorizeAiAction, handleSaaSRequest, type SaaSEnv } from './saas'

export interface Env {
  AI: {
    run(model: string, input: unknown): Promise<unknown>
  }
  alvoprompt_media: R2Bucket
  ALVOPROMPT_SYNC: KVNamespace
  CORS_ORIGIN?: string
  CARCARA_API_KEY?: string
  CARCARA_API_BASE?: string
  DB?: D1Database
  FIREBASE_PROJECT_ID?: string
  ASAAS_API_KEY?: string
  ASAAS_API_BASE?: string
  ASAAS_WEBHOOK_TOKEN?: string
  APP_URL?: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sync-pass',
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_MEDIA_BYTES = 100 * 1024 * 1024
const MIN_SYNC_PASS_LENGTH = 12
const CARCARA_BASE = 'https://tunel.harpyacore.com/v1'
const CARCARA_MODEL = 'Carcara-3.8-27B'

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

function toArrayBuffer(arr: number[]): ArrayBuffer {
  const out = new Uint8Array(arr.length)
  for (let i = 0; i < arr.length; i++) out[i] = arr[i]
  return out.buffer
}

async function syncKey(pass: string, prefix = 'sync'): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}:${hex}`
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
): Promise<Response> {
  const pass = (request.headers.get('x-sync-pass') ?? '').trim()
  if (pass.length < MIN_SYNC_PASS_LENGTH) {
    return json({ error: `Frase-chave muito curta (mínimo ${MIN_SYNC_PASS_LENGTH} caracteres).` }, 400)
  }
  const key = await syncKey(pass, prefix)

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
  if (/(youtu\.be)/i.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null
  if (/(youtube\.com)/i.test(u.hostname)) {
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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
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
    const res = await fetchWithTimeout(attempt.url, { headers: attempt.headers })
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

  const captionsRes = await fetchWithTimeout(baseUrl.replace(/\\u0026/g, '&'))
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
  const exportRes = await fetchWithTimeout(
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

async function extractGenericText(target: string): Promise<{ text: string; title: string }> {
  const res = await fetchWithTimeout(target, {
    headers: { 'User-Agent': 'Mozilla/5.0 AlvoPrompter', 'Accept-Language': 'pt-BR,pt;q=0.8' },
  })
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!allowedOrigin(request, env)) return json({ error: 'Origem não autorizada.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
    const url = new URL(request.url)

    const saasResponse = await handleSaaSRequest(request, env as Env & SaaSEnv)
    if (saasResponse) return saasResponse

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        status: 'ok',
        service: 'AlvoPrompter API',
        carcara: { configured: Boolean(env.CARCARA_API_KEY), model: CARCARA_MODEL },
        workersAi: { configured: Boolean(env.AI) },
      })
    }

    if (request.method === 'POST' && ['/chat', '/transcribe', '/tts', '/translate', '/avatar'].includes(url.pathname)) {
      const quotaResponse = await authorizeAiAction(request, env as Env & SaaSEnv)
      if (quotaResponse) return quotaResponse
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'chat', 100)
      if (limited) return limited
      if (!env.CARCARA_API_KEY) return json({ error: 'Serviço de IA não configurado.' }, 503)
      if (requestTooLarge(request, 128 * 1024)) return json({ error: 'Solicitação muito grande.' }, 413)
      const input = (await request.json().catch(() => null)) as {
        messages?: { role?: string; content?: string }[]
        temperature?: number
        max_tokens?: number
        response_format?: { type?: string }
      } | null
      if (!input?.messages?.length || input.messages.length > 30) {
        return json({ error: 'Conversa inválida.' }, 400)
      }
      const messages = input.messages.map((message) => ({
        role: ['system', 'user', 'assistant'].includes(message.role ?? '') ? message.role : 'user',
        content: String(message.content ?? '').slice(0, 20_000),
      }))
      try {
        const base = (env.CARCARA_API_BASE ?? CARCARA_BASE).replace(/\/$/, '')
        const upstream = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.CARCARA_API_KEY}`,
          },
          body: JSON.stringify({
            model: CARCARA_MODEL,
            messages,
            stream: true,
            temperature: Math.min(1.5, Math.max(0, input.temperature ?? 0.7)),
            max_tokens: Math.min(8_000, Math.max(1, input.max_tokens ?? 2_000)),
            ...(input.response_format?.type === 'json_object'
              ? { response_format: { type: 'json_object' } }
              : {}),
          }),
          signal: request.signal,
        })
        if (!upstream.ok) {
          const message =
            upstream.status === 401 || upstream.status === 403
              ? 'A chave do provedor de IA foi recusada. Atualize o secret do Worker.'
              : upstream.status === 402
                ? 'A conta do provedor de IA está sem saldo disponível.'
                : upstream.status === 400 || upstream.status === 404
                  ? 'O modelo de IA configurado não está disponível.'
                  : upstream.status === 429
                    ? 'O provedor de IA está limitando as solicitações. Aguarde um momento e tente novamente.'
                    : 'O provedor de IA não respondeu corretamente. Tente novamente.'
          return json({ error: message }, upstream.status)
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
        })
      } catch {
        return json({ error: 'A IA está temporariamente indisponível.' }, 502)
      }
    }

    if (url.pathname === '/transcribe' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'transcribe', 20)
      if (limited) return limited
      if (requestTooLarge(request, MAX_AUDIO_BYTES + 1024 * 1024)) return json({ error: 'Áudio acima do limite de 25 MB.' }, 413)
      const form = await request.formData()
      const audio = form.get('audio')
      const lang = (form.get('lang') as string | null) ?? 'pt'
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
      } catch (err) {
        return json({ error: (err as Error).message }, 500)
      }
    }

    if (url.pathname === '/tts' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'tts', 50)
      if (limited) return limited
      const { text, lang } = (await request.json()) as { text?: string; lang?: string }
      if (!text) return json({ error: 'Campo "text" ausente.' }, 400)
      if (text.length > 5_000) return json({ error: 'Texto acima do limite de 5.000 caracteres.' }, 413)
      const requestedLang = (lang ?? 'pt-BR').trim().replace('_', '-') || 'pt-BR'
      const langCode = requestedLang.toLowerCase().split('-')[0] || 'pt'

      try {
        const result = (await env.AI.run('@cf/myshell-ai/melotts', {
          prompt: text,
          lang: langCode,
        })) as { audio: number[] }
        return new Response(toArrayBuffer(result.audio), {
          headers: { 'Content-Type': 'audio/wav', ...CORS_HEADERS },
        })
      } catch {
        // Aura 1 tem vozes em inglês. Para outros idiomas, falhar é melhor
        // do que entregar ao usuário uma pronúncia inglesa incorreta.
      }

      if (langCode === 'pt') {
        try {
          const language = requestedLang.toLowerCase() === 'pt-pt' ? 'pt-PT' : 'pt-BR'
          const result = (await env.AI.run('xai/grok-tts', {
            text,
            language,
            voice_id: 'ara',
            text_normalization: true,
            output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
          })) as { audio?: string; result?: { audio?: string } }
          const audioUrl = result.audio ?? result.result?.audio
          if (!audioUrl) throw new Error('O provedor não retornou o arquivo de áudio.')
          const audio = await fetch(audioUrl)
          if (!audio.ok || !audio.body) throw new Error(`Falha ao obter o áudio (${audio.status}).`)
          return new Response(audio.body, {
            headers: {
              'Content-Type': audio.headers.get('Content-Type') ?? 'audio/mpeg',
              ...CORS_HEADERS,
            },
          })
        } catch (err) {
          return json(
            { error: `A voz em português está temporariamente indisponível: ${(err as Error).message}` },
            503,
          )
        }
      }

      if (langCode !== 'en') {
        return json({ error: `Ainda não há uma voz configurada para o idioma “${requestedLang}”.` }, 422)
      }

      try {
        const resp = (await env.AI.run(
          '@cf/deepgram/aura-1',
          { text, container: 'wav', encoding: 'linear16', sample_rate: 24000, speaker: 'asteria' },
          { returnRawResponse: true },
        )) as Response
        const headers = new Headers(resp.headers)
        headers.set('Access-Control-Allow-Origin', '*')
        return new Response(resp.body, { status: resp.status, headers })
      } catch {
        return json(
          { error: 'Dublagem indisponível no momento. O modelo MeloTTS está fora do ar nesta conta e o Aura não respondeu. Tente mais tarde ou use a leitura do navegador.' },
          503,
        )
      }
    }

    if (url.pathname === '/translate' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'translate', 100)
      if (limited) return limited
      const { text, sourceLang, targetLang } = (await request.json()) as {
        text?: string
        sourceLang?: string
        targetLang?: string
      }
      if (!text || !targetLang) return json({ error: 'Campos "text" e "targetLang" obrigatórios.' }, 400)
      if (text.length > 15_000) return json({ error: 'Texto acima do limite de 15.000 caracteres.' }, 413)
      try {
        const result = (await env.AI.run('@cf/meta/m2m100-1.2b', {
          text,
          source_lang: sourceLang ?? 'pt',
          target_lang: targetLang,
        })) as { translated_text?: string }
        return json({ result })
      } catch (err) {
        return json({ error: (err as Error).message }, 500)
      }
    }

    if (url.pathname === '/import-url' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'import', 60)
      if (limited) return limited
      const { url: target } = (await request.json()) as { url?: string }
      if (!target) return json({ error: 'Campo "url" ausente.' }, 400)
      if (target.length > 2_048) return json({ error: 'URL acima do limite permitido.' }, 413)
      const blocked = importUrlBlocked(target)
      if (blocked) return json({ error: blocked }, 400)
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        return json({ error: 'URL inválida.' }, 400)
      }
      try {
        if (/(youtube\.com|youtu\.be)/i.test(parsed.hostname)) {
          return json({ result: await extractYouTubeTranscript(target) })
        }
        if (/docs\.google\.com/i.test(parsed.hostname)) {
          return json({ result: await extractGoogleDocs(target) })
        }
        return json({ result: await extractGenericText(target) })
      } catch (err) {
        return json({ error: (err as Error).message }, 502)
      }
    }

    if (url.pathname === '/avatar' && request.method === 'POST') {
      const limited = await enforceRateLimit(request, env, 'avatar', 10)
      if (limited) return limited
      const { prompt } = (await request.json()) as { prompt?: string }
      if (!prompt) return json({ error: 'Campo "prompt" ausente.' }, 400)
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
      } catch (err) {
        return json({ error: (err as Error).message }, 500)
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
      const key = await syncKey(pass)

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
      return handleCollection(request, env.ALVOPROMPT_SYNC, 'schedules', 'posts', sanitizePost)
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
      )
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
      const key = `${await syncKey(pass, 'media')}:${rawKey}`
      if (request.method === 'PUT') {
        if (requestTooLarge(request, MAX_MEDIA_BYTES)) return json({ error: 'Mídia acima do limite de 100 MB.' }, 413)
        await env.alvoprompt_media.put(key, request.body)
        return json({ ok: true, key: rawKey })
      }
      if (request.method === 'GET') {
        const object = await env.alvoprompt_media.get(key)
        if (!object) return json({ error: 'Arquivo não encontrado.' }, 404)
        const headers = new Headers(CORS_HEADERS)
        object.writeHttpMetadata(headers)
        headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream')
        headers.set('ETag', object.httpEtag)
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
