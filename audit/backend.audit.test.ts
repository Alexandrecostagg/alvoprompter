import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeAiAction, handleSaaSRequest, type SaaSEnv } from '../api/transcribe/src/saas'
import { workspaceContent } from '../api/transcribe/src/content'
import { testDatabase } from './d1-test-db'

vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }),
  importX509: async () => ({}),
  jwtVerify: async (token: string) => ({ payload: { sub: token, email: `${token}@example.test`, name: token, email_verified: true } }),
}))
afterEach(() => vi.unstubAllGlobals())
function setup() {
  const data = testDatabase()
  data.sqlite.exec(`INSERT INTO users VALUES ('owner','owner@example.test','Owner','2026-09-23','2026-09-23');
    INSERT INTO checkout_sessions (id,user_id,plan,asaas_checkout_id,checkout_url,status,created_at,updated_at) VALUES ('local','owner','studio','checkout','https://test.invalid','pending','2026-09-23','2026-09-23');
    INSERT INTO workspaces VALUES ('aabb','Team','owner','2026-09-23','2026-09-23');
    INSERT INTO workspace_members VALUES ('m','aabb','owner','owner@example.test','Owner','owner','2026-09-23','2026-09-23');`)
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', ASAAS_WEBHOOK_TOKEN: 'audit-only' }
  return { ...data, env }
}
const eventRequest = (id = 'event-1', event = 'CHECKOUT_PAID') => new Request('https://test.invalid/webhooks/asaas', {
  method: 'POST', headers: { 'asaas-access-token': 'audit-only' }, body: JSON.stringify({ id, event, checkout: { id: 'checkout', subscription: { id: 'sub-1' } } }),
})

describe('payment recovery and authorization', () => {
  it('rejects account access without authentication', async () => {
    expect((await handleSaaSRequest(new Request('https://test.invalid/account'), setup().env))?.status).toBe(401)
  })
  it('rejects a webhook without its secret', async () => {
    expect((await handleSaaSRequest(new Request('https://test.invalid/webhooks/asaas', { method: 'POST' }), setup().env))?.status).toBe(401)
  })
  it('fails closed if monthly quotas are not configured', async () => {
    expect((await authorizeAiAction(new Request('https://test.invalid/chat'), { DB: setup().db, FIREBASE_PROJECT_ID: 'configure-test' }))?.status).toBe(503)
  })
  it('rolls back an event on failure and successfully retries the same payment', async () => {
    const { env, sqlite, failNextBatch } = setup()
    failNextBatch()
    expect((await handleSaaSRequest(eventRequest(), env))?.status).toBe(503)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()?.n).toBe(0)
    expect((await handleSaaSRequest(eventRequest(), env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('active')
    expect(await (await handleSaaSRequest(eventRequest(), env))?.json()).toEqual({ ok: true, duplicate: true })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()?.n).toBe(1)
  })
  it('does not mark a payment handled before its checkout exists', async () => {
    const { env, sqlite } = setup()
    sqlite.exec('DELETE FROM checkout_sessions')
    expect((await handleSaaSRequest(eventRequest(), env))?.status).toBe(503)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()?.n).toBe(0)
  })
  it('cannot downgrade a paid checkout with a late expiration event', async () => {
    const { env, sqlite } = setup()
    await handleSaaSRequest(eventRequest(), env)
    await handleSaaSRequest(eventRequest('event-2', 'CHECKOUT_EXPIRED'), env)
    expect(sqlite.prepare('SELECT status FROM checkout_sessions').get()?.status).toBe('paid')
  })
})

describe('workspace content', () => {
  const put = (revision: number, content = 'Texto', deleted = false) => new Request('https://test.invalid', { method: 'PUT', body: JSON.stringify({ key: 'script-1', revision, payload: { title: 'Roteiro', content }, deleted }) })
  it('enforces reader permissions and prevents an editor changing the brand kit', async () => {
    const { db } = setup()
    expect((await workspaceContent(put(0), db, 'aabb', 'scripts', 'owner', 'viewer')).status).toBe(403)
    expect((await workspaceContent(put(0), db, 'aabb', 'brandkit', 'owner', 'editor')).status).toBe(403)
  })
  it('rejects stale edits and propagates deletion as a revision', async () => {
    const { db } = setup()
    expect((await workspaceContent(put(0), db, 'aabb', 'scripts', 'owner', 'editor')).status).toBe(200)
    expect((await workspaceContent(put(0, 'Stale'), db, 'aabb', 'scripts', 'owner', 'editor')).status).toBe(409)
    expect((await workspaceContent(put(1, 'Texto', true), db, 'aabb', 'scripts', 'owner', 'editor')).status).toBe(200)
    const body = await (await workspaceContent(new Request('https://test.invalid'), db, 'aabb', 'scripts', 'owner', 'viewer')).json() as { records: { revision: number; deletedAt: string }[] }
    expect(body.records[0]?.revision).toBe(2)
    expect(body.records[0]?.deletedAt).toBeTruthy()
  })
  it('checks membership and the owners active plan at the route boundary', async () => {
    const { env, sqlite } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ test: 'test-certificate' }))))
    const request = (uid: string) => new Request('https://test.invalid/account/workspaces/aabb/content/scripts', { headers: { Authorization: `Bearer ${uid}` } })
    expect((await handleSaaSRequest(request('outsider'), env))?.status).toBe(403)
    expect((await handleSaaSRequest(request('owner'), env))?.status).toBe(403)
    await handleSaaSRequest(eventRequest(), env)
    expect((await handleSaaSRequest(request('owner'), env))?.status).toBe(200)
    sqlite.exec("UPDATE subscriptions SET status='past_due'")
    expect((await handleSaaSRequest(request('owner'), env))?.status).toBe(403)
  })
})

describe('team plan limits and verified invitations', () => {
  it('creates a workspace with its owner membership and respects the Creator limit',async()=>{
    const {env,sqlite}=setup()
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({test:'certificate'}))))
    await handleSaaSRequest(eventRequest(),env)
    const create=()=>new Request('https://test.invalid/account/workspaces',{method:'POST',headers:{Authorization:'Bearer owner'},body:JSON.stringify({name:'Nova equipe'})})
    expect((await handleSaaSRequest(create(),env))?.status).toBe(201)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM workspaces').get()?.n).toBe(2)
    sqlite.exec("UPDATE subscriptions SET plan='creator'")
    expect((await handleSaaSRequest(create(),env))?.status).toBe(403)
  })
  it('protects the owner and prevents a sixth team member',async()=>{
    const {env,sqlite}=setup()
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({test:'certificate'}))))
    await handleSaaSRequest(eventRequest(),env)
    const invite=(email:string)=>new Request('https://test.invalid/account/workspaces/aabb/members',{method:'POST',headers:{Authorization:'Bearer owner'},body:JSON.stringify({email,role:'editor'})})
    expect((await handleSaaSRequest(invite('owner@example.test'),env))?.status).toBe(403)
    for(let i=0;i<4;i++) expect((await handleSaaSRequest(invite(`person${i}@example.test`),env))?.status).toBe(201)
    expect((await handleSaaSRequest(invite('sixth@example.test'),env))?.status).toBe(403)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM workspace_members').get()?.n).toBe(5)
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM workspace_members WHERE user_id IS NOT NULL").get()?.n).toBe(1)
  })
})
