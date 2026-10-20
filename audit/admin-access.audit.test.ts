import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDatabase } from './d1-test-db'
import { handleSaaSRequest, authorizeAiAction, type SaaSEnv } from '../api/transcribe/src/saas'
import { reviewGrant, sendAdminEmail } from '../api/transcribe/src/adminAccess'
vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }), importX509: async () => ({}),
  jwtVerify: async (token: string) => ({ payload: { auth_time: 1, sub: token, email: `${token}@example.test`, email_verified: token !== 'unverified', name: token } }),
}))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function setup() {
  vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ test: 'certificate' }))))
  const data = testDatabase()
  data.sqlite.exec("INSERT INTO users VALUES('person','person@example.test','Person','2026-10-01','2026-10-01'); INSERT INTO users VALUES('admin','admin@example.test','Admin','2026-10-01','2026-10-01'); INSERT INTO users VALUES('teamadmin','team@example.test','Team admin','2026-10-01','2026-10-01')")
  const send = vi.fn(async () => undefined)
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', ADMIN_USER_IDS: 'admin', BILLING_QUEUE: { send } as unknown as NonNullable<SaaSEnv['BILLING_QUEUE']> }
  const call = (path: string, actor = 'admin', body?: object) => handleSaaSRequest(new Request('https://app.test'+path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${actor}` }, body: body ? JSON.stringify(body) : undefined }), env)
  const grant = (body: object = {}) => call('/admin/users/person/access','admin', { action: 'grant', plan: 'studio', expiresAt: '2026-10-30T15:00:00Z', reason: 'Teste de lançamento', expectedRevision: null, ...body })
  return { ...data, env, send, call, grant }
}
describe('platform administration and temporary access', () => {
  it('denies anonymous, ordinary and workspace admin access, regardless of client claims', async () => {
    const { env, sqlite, call } = setup()
    sqlite.exec("INSERT INTO workspaces VALUES('space','Space','teamadmin','2026-10-01','2026-10-01'); INSERT INTO workspace_members VALUES('m','space','teamadmin','team@example.test','Team','admin','2026-10-01','2026-10-01')")
    expect((await handleSaaSRequest(new Request('https://app.test/admin/overview'), env))?.status).toBe(401)
    for (const actor of ['person','teamadmin','unverified']) expect((await call('/admin/overview',actor))?.status).toBe(403)
    expect((await call('/admin/users/person/access','person',{ action:'grant',plan:'studio',isAdmin:true,expiresAt:'2030-01-01' }))?.status).toBe(403)
    expect(sqlite.prepare('SELECT count(*) AS n FROM access_grants').get()?.n).toBe(0)
  })
  it('records a user request without granting access or charging; rejects duplicates', async () => {
    const { call, sqlite } = setup()
    expect((await call('/account/access-request','person',{plan:'studio'}))?.status).toBe(201)
    expect((await call('/account/access-request','person',{plan:'creator'}))?.status).toBe(409)
    const account = await (await call('/account','person'))!.json()
    expect(account.subscription.plan).toBe('free')
    expect(account.access.request.status).toBe('pending')
    expect(sqlite.prepare('SELECT count(*) AS n FROM checkout_intents').get()?.n).toBe(0)
    expect(sqlite.prepare('SELECT count(*) AS n FROM admin_notifications').get()?.n).toBe(1)
  })
  it('rejects unverified requests, invalid plans and dates', async () => {
    const { grant, call } = setup()
    expect((await call('/account/access-request','unverified',{plan:'studio'}))?.status).toBe(403)
    for (const patch of [{plan:'enterprise'}, {expiresAt:'2026-10-19'}, {expiresAt:'2028-01-01'}, {expiresAt:'bogus'}, {reason:''}]) expect((await grant(patch))?.status).toBe(400)
  })
  it('applies server limits, expires exactly on time and keeps data', async () => {
    const { grant, call, env, sqlite } = setup()
    expect((await grant())?.status).toBe(200)
    expect((await (await call('/account','person'))!.json()).limits.aiActionsMonthly).toBe(300)
    sqlite.exec("INSERT INTO usage_monthly VALUES('person','2026-10',10,'2026-10-20')")
    expect(await authorizeAiAction(new Request('https://app.test/chat',{headers:{Authorization:'Bearer person'}}),env)).toBeNull()
    vi.setSystemTime(new Date('2026-10-30T15:00:00Z'))
    const account = await (await call('/account','person'))!.json()
    expect(account.subscription.plan).toBe('free')
    expect(account.access.grant.status).toBe('expired')
    expect((await authorizeAiAction(new Request('https://app.test/chat',{headers:{Authorization:'Bearer person'}}),env))?.status).toBe(429)
    expect(sqlite.prepare('SELECT count(*) AS n FROM users WHERE id=?').get('person')?.n).toBe(1)
  })
  it('does not downgrade an existing paid subscription when a grant expires or is revoked', async () => {
    const { grant, call, sqlite } = setup()
    sqlite.exec("INSERT INTO subscriptions(id,user_id,plan,status,current_period_end,created_at,updated_at,provider) VALUES('paid','person','studio','active','2026-12-01','2026-10-01','2026-10-01','apple')")
    await grant({plan:'creator'})
    const revision = sqlite.prepare('SELECT revision FROM access_grants').get()?.revision
    expect((await (await call('/account','person'))!.json()).subscription.plan).toBe('studio')
    await grant({action:'revoke',expectedRevision:revision})
    const summary = await (await call('/account','person'))!.json()
    expect(summary.subscription.plan).toBe('studio'); expect(summary.subscription.provider).toBe('apple')
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('active')
  })
  it('rejects stale edits and rolls back failed grants and audit atomically', async () => {
    const { grant, sqlite, failNextBatch } = setup()
    failNextBatch(); expect((await grant())?.status).toBe(503)
    expect(sqlite.prepare('SELECT count(*) AS n FROM access_grants').get()?.n).toBe(0)
    expect(sqlite.prepare('SELECT count(*) AS n FROM admin_audit').get()?.n).toBe(0)
    await grant(); expect((await grant())?.status).toBe(409)
    expect(sqlite.prepare('SELECT count(*) AS n FROM admin_audit').get()?.n).toBe(1)
  })
  it('warns before expiry and at expiry only once, without depending on user login', async () => {
    const { grant, env, sqlite, send } = setup()
    await grant()
    const revision = sqlite.prepare('SELECT revision FROM access_grants').get()?.revision as string
    expect(send).toHaveBeenCalledWith({kind:'access-review',userId:'person',revision},{delaySeconds:86400})
    vi.setSystemTime(new Date('2026-10-27T15:00:00Z'))
    await reviewGrant(env,'person',revision); await reviewGrant(env,'person',revision)
    expect(sqlite.prepare("SELECT count(*) AS n FROM admin_notifications WHERE kind='expiring'").get()?.n).toBe(1)
    vi.setSystemTime(new Date('2026-10-30T15:00:00Z'))
    await reviewGrant(env,'person',revision); await reviewGrant(env,'person',revision)
    expect(sqlite.prepare("SELECT count(*) AS n FROM admin_notifications WHERE kind='expired'").get()?.n).toBe(1)
    expect(sqlite.prepare('SELECT timer_status FROM access_grants').get()?.timer_status).toBe('complete')
  })
  it('ignores a timer from an earlier renewal and recovers a failed queue schedule', async () => {
    const { grant, env, sqlite, send, call } = setup()
    send.mockRejectedValueOnce(new Error('offline'))
    expect((await (await grant())!.json()).warning).toContain('pendente')
    const old = sqlite.prepare('SELECT revision FROM access_grants').get()?.revision as string
    await call('/admin/overview'); expect(sqlite.prepare('SELECT timer_status FROM access_grants').get()?.timer_status).toBe('scheduled')
    await grant({expectedRevision:old,expiresAt:'2026-11-30T15:00:00Z'})
    send.mockClear(); await reviewGrant(env,'person',old); expect(send).not.toHaveBeenCalled()
  })
  it('indicates a paid plan without creating checkout, subscription or card charge', async () => {
    const { grant, sqlite, call } = setup()
    await grant()
    const revision = sqlite.prepare('SELECT revision FROM access_grants').get()?.revision
    const upstream = vi.fn(); vi.stubGlobal('fetch',upstream)
    await grant({action:'checkout',plan:'creator',expectedRevision:revision})
    const account = await (await call('/account','person'))!.json()
    expect(account.subscription.plan).toBe('free'); expect(account.access.request).toMatchObject({plan:'creator',status:'checkout_required'})
    expect(upstream).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT count(*) AS n FROM subscriptions').get()?.n).toBe(0)
    expect(sqlite.prepare('SELECT count(*) AS n FROM checkout_intents').get()?.n).toBe(0)
  })
  it('shows missing email configuration and never sends to a user supplied recipient', async () => {
    const { call, env, sqlite } = setup()
    await call('/account/access-request','person',{plan:'creator'})
    const row = sqlite.prepare('SELECT id FROM admin_notifications').get()!
    const mail = vi.fn(async()=>new Response('{"id":"email"}',{status:200})); vi.stubGlobal('fetch',mail)
    await sendAdminEmail(env,row.id as string); expect(mail).not.toHaveBeenCalled()
    env.RESEND_API_KEY='audit-only';env.ADMIN_EMAIL_FROM='Admin <admin@example.test>';env.ADMIN_NOTIFY_EMAIL='owner@example.test'
    await sendAdminEmail(env,row.id as string); await sendAdminEmail(env,row.id as string)
    expect(mail).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(mail.mock.calls[0]![1].body as string)
    expect(payload.to).toEqual(['owner@example.test'])
    expect(mail.mock.calls[0]![1].headers['Idempotency-Key']).toContain(row.id)
  })
})
