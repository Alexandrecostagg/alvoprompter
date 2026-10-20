import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDatabase } from './d1-test-db'
import { adminAppPolicy, publicAppPolicy } from '../api/transcribe/src/appPolicy'
import { parsePolicy, STORE_URLS, updateRequired } from '../src/lib/appPolicy'
import { handleSaaSRequest, authorizeAiAction, type SaaSEnv } from '../api/transcribe/src/saas'
import worker, { type Env } from '../api/transcribe/src/index'

vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'policy-test' }), importX509: async () => ({}),
  jwtVerify: async (token: string) => ({ payload: { auth_time: 1, sub: token, email: `${token}@example.test`, email_verified: token !== 'unverified', name: token } }),
}))
afterEach(() => vi.unstubAllGlobals())
function setup() {
  const data = testDatabase()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ 'policy-test': 'certificate' }))))
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', ADMIN_USER_IDS: 'admin' }
  const call = (actor = 'admin', body?: object) => handleSaaSRequest(new Request('https://test.invalid/admin/app-policy', { method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${actor}` }, body: body ? JSON.stringify(body) : undefined }), env)
  const body = { platform: 'ios', minimumBuild: 23, version: '1.6.5', expectedRevision: 0, storeAvailable: true }
  return { ...data, env, call, body }
}
describe('store version policy and verified access', () => {
  it('starts disabled on both platforms and exposes no actor information', async () => {
    const { db } = setup()
    for (const platform of ['ios', 'android']) {
      const reply = await publicAppPolicy(new Request(`https://test.invalid/app-policy?platform=${platform}`), db)
      expect(reply.headers.get('Cache-Control')).toBe('no-store')
      expect(await reply.json()).toEqual({ platform, minimumBuild: 0, version: '1.6.4', revision: 0 })
    }
  })
  it('validates platform, build and store readiness before writing', async () => {
    const { db, call, body, sqlite } = setup()
    expect((await publicAppPolicy(new Request('https://test.invalid/app-policy?platform=web'), db)).status).toBe(400)
    for (const edit of [{ minimumBuild: -1 }, { minimumBuild: 23.5 }, { minimumBuild: '23' }, { minimumBuild: 2147483648 }, { version: '<script>' }, { expectedRevision: -1 }, { storeAvailable: false }]) expect((await call('admin', { ...body, ...edit }))?.status).toBe(400)
    expect(sqlite.prepare('SELECT count(*) AS n FROM app_policy_audit').get()?.n).toBe(0)
  })
  it('restricts changes to a verified root admin, including reads', async () => {
    const { call, body } = setup()
    for (const actor of ['person', 'teamadmin', 'unverified']) {
      expect((await call(actor))?.status).toBe(403)
      expect((await call(actor, body))?.status).toBe(403)
    }
    expect((await handleSaaSRequest(new Request('https://test.invalid/admin/app-policy'), setup().env))?.status).toBe(401)
  })
  it('isolates platforms, audits the actor and rejects stale concurrent edits', async () => {
    const { call, body, db, sqlite } = setup()
    expect((await call('admin', body))?.status).toBe(200)
    expect((await call('admin', body))?.status).toBe(409)
    const p = await (await publicAppPolicy(new Request('https://test.invalid/app-policy?platform=android'), db)).json()
    expect(p.minimumBuild).toBe(0)
    const audit = sqlite.prepare('SELECT actor_id,before_json,after_json FROM app_policy_audit').get()!
    expect(audit.actor_id).toBe('admin'); expect(JSON.parse(String(audit.before_json)).minimumBuild).toBe(0)
    expect(JSON.parse(String(audit.after_json)).minimumBuild).toBe(23)
    expect((await call('admin', { ...body, minimumBuild: 0, expectedRevision: 1, storeAvailable: false }))?.status).toBe(200)
  })
  it('rolls back audit and policy together on storage failure', async () => {
    const { db, body, failNextBatch, sqlite } = setup()
    failNextBatch()
    await expect(adminAppPolicy(new Request('https://test.invalid/admin/app-policy', { method: 'PUT', body: JSON.stringify(body) }), db, 'admin')).rejects.toThrow()
    expect(sqlite.prepare("SELECT minimum_build FROM app_policy WHERE platform='ios'").get()?.minimum_build).toBe(0)
    expect(sqlite.prepare('SELECT count(*) AS n FROM app_policy_audit').get()?.n).toBe(0)
  })
  it('compares native build numbers, with disabled, equal and newer builds allowed', () => {
    const policy = parsePolicy({ platform: 'ios', minimumBuild: 23, revision: 1, version: '1.6.5' }, 'ios')!
    expect(updateRequired(policy, '22')).toBe(true)
    for (const build of ['23', '24', '100']) expect(updateRequired(policy, build)).toBe(false)
    expect(updateRequired({ ...policy, minimumBuild: 0 }, '22')).toBe(false)
    expect(parsePolicy({ ...policy, platform: 'android' }, 'ios')).toBeNull()
    expect(parsePolicy({ ...policy, minimumBuild: '23' }, 'ios')).toBeNull()
    expect(parsePolicy({ ...policy, revision: -1 }, 'ios')).toBeNull()
    expect(STORE_URLS.ios.startsWith('https://apps.apple.com/')).toBe(true)
    expect(STORE_URLS.android.startsWith('https://play.google.com/')).toBe(true)
  })
  it('rejects unverified AI usage before syncing the user, charging quota or calling a provider', async () => {
    const { env, sqlite } = setup()
    const reply = await authorizeAiAction(new Request('https://test.invalid/chat', { headers: { Authorization: 'Bearer unverified' } }), env)
    expect(reply?.status).toBe(403)
    expect((await reply!.json()).code).toBe('EMAIL_VERIFICATION_REQUIRED')
    expect(sqlite.prepare('SELECT count(*) AS n FROM usage_monthly').get()?.n).toBe(0)
    expect(sqlite.prepare('SELECT count(*) AS n FROM users').get()?.n).toBe(0)
    expect((await authorizeAiAction(new Request('https://test.invalid/chat'), env))?.status).toBe(401)
    expect(await authorizeAiAction(new Request('https://test.invalid/chat', { headers: { Authorization: 'Bearer verified' } }), env)).toBeNull()
  })
  it('protects cloud endpoints on the server while the policy endpoint stays public', async () => {
    const { env } = setup()
    for (const path of ['/sync', '/media/test', '/import-url', '/schedules', '/broll']) {
      const reply = await worker.fetch(new Request(`https://test.invalid${path}`, { headers: { Authorization: 'Bearer unverified' } }), env as Env)
      expect(reply.status).toBe(403)
      expect((await reply.json()).code).toBe('EMAIL_VERIFICATION_REQUIRED')
      expect((await worker.fetch(new Request(`https://test.invalid${path}`), env as Env)).status).toBe(401)
    }
    expect((await worker.fetch(new Request('https://test.invalid/app-policy?platform=ios'), env as Env)).status).toBe(200)
  })
})
