import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPair, exportSPKI, importSPKI, SignJWT } from 'jose'
import worker, { type Env } from '../api/transcribe/src/index'
import { fetchImport, readLimited, takeRateLimit } from '../api/transcribe/src/security'
import { testDatabase } from './d1-test-db'

// Only certificate decoding is adapted to an ephemeral test key. Signature,
// expiry, audience and issuer validation use the real jose implementation.
vi.mock('jose', async (original) => ({ ...await original<typeof import('jose')>(), importX509: (pem: string) => importSPKI(pem, 'RS256') }))
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let publicPem: string
beforeAll(async () => { keys = await generateKeyPair('RS256'); publicPem = await exportSPKI(keys.publicKey) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function token(uid = 'alice', claims: Record<string, unknown> = {}) {
  return new SignJWT({ sub: uid, email: `${uid}@example.test`, email_verified: true, auth_time: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'alvoprompt', iss: 'https://securetoken.google.com/alvoprompt', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'security-test' }).sign(keys.privateKey)
}
async function setup() {
  const data = testDatabase()
  const store = new Map<string, string>()
  const media = new Map<string, { body: Uint8Array; type: string }>()
  const fetcher = vi.fn(async (url: string) => {
    if (String(url).includes('googleapis.com/robot')) return new Response(JSON.stringify({ 'security-test': publicPem }))
    throw new Error('Unexpected network call')
  })
  vi.stubGlobal('fetch', fetcher)
  const env = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', CORS_ORIGIN: 'https://app.example.test',
    ALVOPROMPT_SYNC: { get: async (key: string) => store.get(key) ?? null, put: async (key: string, value: string) => { store.set(key, value) } },
    alvoprompt_media: {
      put: vi.fn(async (key: string, body: ReadableStream, opts: { httpMetadata: { contentType: string } }) => { media.set(key, { body: new Uint8Array(await new Response(body).arrayBuffer()), type: opts.httpMetadata.contentType }) }),
      get: vi.fn(async (key: string) => { const item = media.get(key); return item ? { body: item.body, httpMetadata: { contentType: item.type }, httpEtag: 'test', writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', item.type) } : null }),
      head: vi.fn(async (key: string) => media.has(key) ? { httpMetadata: { contentType: media.get(key)!.type } } : null),
      delete: vi.fn(async (key: string) => { media.delete(key) }),
    },
  } as unknown as Env
  const alice = await token()
  const req = (path: string, method = 'GET', body?: string, authorization: string | null = alice, extra = {}) => worker.fetch(new Request(`https://test.invalid${path}`, { method,
    headers: { ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), 'x-sync-pass': 'same-passphrase-for-two-users', ...extra }, ...(body === undefined ? {} : { body }) }), env)
  return { ...data, env, store, media, req, fetcher }
}

describe('security boundaries with real signed JWTs', () => {
  it.each(['/account', '/sync', '/schedules', '/workspaces', '/media/private.mp4', '/broll'])('rejects anonymous %s', async path => {
    const { req } = await setup()
    expect((await req(path, 'GET', undefined, null)).status).toBe(401)
  })
  it.each([
    { exp: 1 }, { aud: 'other-project' }, { iss: 'https://attacker.test' }, { iat: 9999999999 },
    { auth_time: 9999999999 }, { auth_time: 'yesterday' }, { sub: '' }, { sub: 'x'.repeat(129) },
  ])('rejects invalid Firebase claims %j', async claims => {
    const { req } = await setup()
    expect((await req('/account', 'GET', undefined, await token('alice', claims))).status).toBe(401)
  })
  it('rejects forged, unsigned and malformed tokens without disclosing validation details', async () => {
    const { req } = await setup()
    const signed = await token()
    const parts = signed.split('.')
    parts[1] = Buffer.from(JSON.stringify({ sub: 'owner', email: 'owner@example.test' })).toString('base64url')
    for (const value of [parts.join('.'), 'not-a-token', `${Buffer.from('{"alg":"none"}').toString('base64url')}.${parts[1]}.`]) {
      const response = await req('/account', 'GET', undefined, value)
      expect(response.status).toBe(401)
      expect(await response.text()).not.toMatch(/JWT|signature|claim|certificate/i)
    }
  })
  it('rejects missing expiration even if correctly signed', async () => {
    const { req } = await setup()
    const value = await new SignJWT({ sub: 'alice', email: 'a@example.test', auth_time: 1, iat: Math.floor(Date.now()/1000), aud: 'alvoprompt', iss: 'https://securetoken.google.com/alvoprompt' }).setProtectedHeader({ alg: 'RS256', kid: 'security-test' }).sign(keys.privateKey)
    expect((await req('/account', 'GET', undefined, value)).status).toBe(401)
  })
  it.each([['/sync', 'scripts'], ['/schedules', 'posts'], ['/workspaces', 'workspaces']])('isolates %s even when users choose the same phrase', async (path, field) => {
    const { req } = await setup()
    expect((await req(path, 'PUT', JSON.stringify({ [field]: [{ key: 'private', title: 'Private script', name: 'Private workspace', content: 'Secret' }] }))).status).toBe(200)
    expect((await (await req(path)).json())[field]).toHaveLength(1)
    expect((await (await req(path, 'GET', undefined, await token('bob'))).json())[field]).toEqual([])
  })
  it('denies an outsider who knows the workspace ID and claims owner in the payload', async () => {
    const { req, sqlite } = await setup()
    sqlite.exec("INSERT INTO users VALUES ('owner','owner@example.test','Owner','now','now'); INSERT INTO workspaces VALUES ('aabb','Private','owner','now','now')")
    const response = await req('/account/workspaces/aabb/content/scripts', 'PUT', JSON.stringify({ uid: 'owner', role: 'owner', key: 'stolen', revision: 0, payload: { title: 'Hacked', content: 'x' } }))
    expect(response.status).toBe(403)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_content').get()?.n).toBe(0)
  })
  it('does not disclose SQL failures', async () => {
    const { req, env } = await setup()
    env.DB!.prepare = () => { throw new Error('SQL error users secret-table password=private') }
    const result = await req('/account')
    expect(result.status).toBe(502)
    expect(await result.text()).not.toMatch(/SQL|password|secret-table/)
  })
  it('restricts CORS and applies headers to success and denied requests', async () => {
    const { req } = await setup()
    for (const origin of ['https://app.example.test', 'https://evil.test']) {
      const result = await req('/health', 'GET', undefined, null, { Origin: origin })
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe(origin.includes('evil') ? null : origin)
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(result.headers.get('Cache-Control')).toBe('no-store')
      expect(result.status).toBe(origin.includes('evil') ? 403 : 200)
    }
  })
  it('limits payloads without Content-Length', async () => {
    const { req } = await setup()
    expect((await req('/sync', 'PUT', JSON.stringify({ scripts: [{ content: 'x'.repeat(1024 * 1024) }] }))).status).toBe(413)
  })
  it('rejects executable uploads and missing or oversized Content-Length', async () => {
    const { req, env } = await setup()
    expect((await req('/media/x.html', 'PUT', '<script>bad()</script>', undefined, { 'Content-Length': '22', 'Content-Type': 'text/html' })).status).toBe(415)
    expect((await req('/media/x.mp4', 'PUT', 'video', undefined, { 'Content-Type': 'video/mp4' })).status).toBe(411)
    expect((await req('/media/x.mp4', 'PUT', 'video', undefined, { 'Content-Length': String(101*1024*1024), 'Content-Type': 'video/mp4' })).status).toBe(413)
    expect(env.alvoprompt_media.put).not.toHaveBeenCalled()
  })
  it('isolates uploaded files by account and exposes only an explicitly shared video', async () => {
    vi.stubGlobal('FixedLengthStream', class extends TransformStream<Uint8Array, Uint8Array> {
      constructor(length: number) { let seen = 0; super({ transform(chunk, c) { seen += chunk.length; if (seen > length) throw new Error('overflow'); c.enqueue(chunk) }, flush() { if (seen !== length) throw new Error('truncated') } }) }
    })
    const { req, env } = await setup()
    expect((await req('/media/private.mp4', 'PUT', 'clip', undefined, { 'Content-Length': '4', 'Content-Type': 'video/mp4' })).status).toBe(200)
    const bob = await token('bob')
    expect((await req('/media/private.mp4', 'GET', undefined, bob)).status).toBe(404)
    expect((await req('/videopages', 'POST', JSON.stringify({ title: 'Stolen', mediaKey: 'private.mp4' }), bob)).status).toBe(400)
    await req('/media/private.mp4', 'DELETE', undefined, bob)
    const mine = await req('/media/private.mp4')
    expect(await mine.text()).toBe('clip')
    expect(mine.headers.get('Content-Disposition')).toBe('attachment')
    const published = await req('/videopages', 'POST', JSON.stringify({ title: '<script>inert text</script>', mediaKey: 'private.mp4' }))
    expect(published.status).toBe(200)
    const page = await published.json() as { id: string; passHash?: string }
    expect(page.passHash).toBeUndefined()
    expect(await (await req(`/videopages/${page.id}/play`, 'GET', undefined, null)).text()).toBe('clip')
    expect(env.alvoprompt_media.put).toHaveBeenCalledTimes(1)
  })
  it('keeps the Pexels credential on the server and requires authentication', async () => {
    const { req, env, fetcher } = await setup()
    env.PEXELS_API_KEY = 'server-only-pexels-key'
    fetcher.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (String(url).includes('googleapis.com/robot')) return Response.json({ 'security-test': publicPem })
      expect(String(url)).toContain('https://api.pexels.com/videos/search?')
      expect(new Headers((args[0] as RequestInit).headers).get('Authorization')).toBe('server-only-pexels-key')
      return Response.json({ videos: [] })
    })
    const response = await req('/broll?query=city')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"videos":[]}')
    expect((await req('/broll?query=city', 'GET', undefined, null)).status).toBe(401)
  })
  it('prevents publishing a missing or another account’s media key', async () => {
    const { req, env } = await setup()
    expect((await req('/videopages', 'POST', JSON.stringify({ title: 'Test', mediaKey: 'other-user.mp4' }))).status).toBe(400)
    expect(env.alvoprompt_media.head).toHaveBeenCalled()
  })
  it('returns a safe error for invalid translation types before invoking AI', async () => {
    const { req } = await setup()
    expect((await req('/translate', 'POST', JSON.stringify({ text: {}, targetLang: [] }))).status).toBe(400)
  })
})

describe('resource and SSRF limits', () => {
  it('applies a rate limit atomically to concurrent attempts', async () => {
    const { db } = testDatabase()
    const results = await Promise.all(Array.from({ length: 20 }, () => takeRateLimit(db, 'same-user', 5)))
    expect(results.filter(Boolean)).toHaveLength(5)
  })
  it.each(['http://127.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'https://youtube.com.evil.test', 'https://example.test', 'https://user:pass@docs.google.com', 'https://docs.google.com:8443'])('does not fetch %s', async url => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(fetchImport(url)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not follow a permitted site redirect to a private or unknown host', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchImport('https://docs.google.com/document/d/test/export')).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toHaveLength(2)
  })
  it('bounds imported response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(2*1024*1024 + 1))))
    await expect(fetchImport('https://docs.google.com/document/d/test/export')).rejects.toMatchObject({ status: 413 })
  })
  it('cancels an oversized chunked body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(6)); c.enqueue(new Uint8Array(6)) }, cancel })
    await expect(readLimited(body, 10)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toHaveBeenCalled()
  })
})
