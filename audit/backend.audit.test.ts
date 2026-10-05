import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeAiAction, handleSaaSRequest, replayAsaasWebhookEvent, type SaaSEnv } from '../api/transcribe/src/saas'
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
  it('durably defers a paid event until its checkout can be recovered', async () => {
    const { env, sqlite } = setup()
    sqlite.exec('DELETE FROM checkout_sessions')
    expect((await handleSaaSRequest(eventRequest(), env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM webhook_events').get()?.n).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pending_webhook_events').get()?.n).toBe(1)
  })
  it('retries a deferred payment through the queue after the checkout is recovered', async () => {
    const { env, sqlite } = setup()
    sqlite.exec('DELETE FROM checkout_sessions')
    const send = vi.fn(async () => ({ metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } } }))
    env.BILLING_QUEUE = { send } as unknown as Queue<{ id: string }>
    expect((await handleSaaSRequest(eventRequest('queued'), env))?.status).toBe(200)
    expect(send).toHaveBeenCalledWith({ id: 'queued' }, { delaySeconds: 60 })
    expect(await replayAsaasWebhookEvent(env, 'queued')).toBe(false)
    sqlite.exec(`INSERT INTO checkout_sessions (id,user_id,plan,asaas_checkout_id,checkout_url,status,created_at,updated_at)
      VALUES ('recovered','owner','studio','checkout','https://test.invalid','pending','2026-09-23','2026-09-23')`)
    expect(await replayAsaasWebhookEvent(env, 'queued')).toBe(true)
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('active')
    expect(await replayAsaasWebhookEvent(env, 'queued')).toBe(true)
  })
  it('asks Asaas to resend when durable replay cannot be enqueued', async () => {
    const { env, sqlite } = setup()
    sqlite.exec('DELETE FROM checkout_sessions')
    env.BILLING_QUEUE = { send: async () => { throw new Error('queue unavailable') } } as unknown as Queue<{ id: string }>
    expect((await handleSaaSRequest(eventRequest('failed-queue'), env))?.status).toBe(503)
    expect(sqlite.prepare('SELECT id FROM pending_webhook_events WHERE id = ?').get('failed-queue')?.id).toBe('failed-queue')
  })
  it('replays a subscription event delivered before checkout payment', async () => {
    const { env, sqlite } = setup()
    const early = new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'early-sub', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub-1', customer: 'cus-1' } }),
    })
    expect((await handleSaaSRequest(early, env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pending_webhook_events').get()?.n).toBe(1)
    const paid = new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'checkout-paid', event: 'CHECKOUT_PAID', checkout: { id: 'checkout', customer: 'cus-1' } }),
    })
    expect((await handleSaaSRequest(paid, env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT asaas_subscription_id FROM subscriptions').get()?.asaas_subscription_id).toBe('sub-1')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pending_webhook_events').get()?.n).toBe(0)
  })
  it('links real checkout events without customer IDs through the payment checkoutSession', async () => {
    const { env, sqlite } = setup()
    const deliver = (body: object) => handleSaaSRequest(new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' }, body: JSON.stringify(body),
    }), env)
    await deliver({ id: 'sub-created', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub-real', customer: 'cus-real' } })
    const payment = { id: 'payment-confirmed', event: 'PAYMENT_CONFIRMED', payment: {
      id: 'pay-real', subscription: 'sub-real', checkoutSession: 'checkout', dueDate: '2026-10-05',
    } }
    await deliver(payment)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pending_webhook_events').get()?.n).toBe(2)
    await deliver({ id: 'checkout-paid-real', event: 'CHECKOUT_PAID', checkout: { id: 'checkout' } })
    expect(sqlite.prepare('SELECT asaas_subscription_id, asaas_customer_id, status, current_period_end FROM subscriptions').get()).toEqual({
      asaas_subscription_id: 'sub-real', asaas_customer_id: 'cus-real', status: 'active', current_period_end: '2026-11-05T12:00:00.000Z',
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM pending_webhook_events').get()?.n).toBe(0)
    expect(await (await deliver(payment))?.json()).toEqual({ ok: true, duplicate: true })
    await deliver({ id: 'renewal', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-next', subscription: 'sub-real', dueDate: '2026-11-05' } })
    expect(sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end).toBe('2026-12-05T12:00:00.000Z')
    await deliver({ id: 'cancel', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub-real' } })
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('canceled')
  })
  it('rolls back a failed payment link and retries without losing the event', async () => {
    const { env, sqlite, failNextBatch } = setup()
    await handleSaaSRequest(eventRequest(), env)
    sqlite.exec('UPDATE subscriptions SET asaas_subscription_id = NULL')
    const payment = () => new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'link-failure', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1', subscription: 'sub-new', checkoutSession: 'checkout', customer: 'cus-1', dueDate: '2026-10-05' } }),
    })
    failNextBatch()
    expect((await handleSaaSRequest(payment(), env))?.status).toBe(503)
    expect(sqlite.prepare('SELECT asaas_subscription_id FROM subscriptions').get()?.asaas_subscription_id).toBeNull()
    expect(sqlite.prepare("SELECT id FROM webhook_events WHERE id = 'link-failure'").get()).toBeUndefined()
    expect((await handleSaaSRequest(payment(), env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT asaas_subscription_id, asaas_customer_id FROM subscriptions').get()).toEqual({ asaas_subscription_id: 'sub-new', asaas_customer_id: 'cus-1' })
  })
  it.each(['unknown-checkout', 'unpaid-checkout', 'apple', 'already-linked'])('does not bind a payment to %s', async (scenario) => {
    const { env, sqlite } = setup()
    await handleSaaSRequest(eventRequest(), env)
    if (scenario !== 'already-linked') sqlite.exec('UPDATE subscriptions SET asaas_subscription_id = NULL')
    if (scenario === 'apple') sqlite.exec("UPDATE subscriptions SET provider = 'apple'")
    if (scenario === 'unpaid-checkout') sqlite.exec("UPDATE checkout_sessions SET status = 'pending'")
    const before = sqlite.prepare('SELECT * FROM subscriptions').get()
    const response = await handleSaaSRequest(new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'invalid-link', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1', subscription: 'sub-new', checkoutSession: scenario === 'unknown-checkout' ? 'unknown' : 'checkout' } }),
    }), env)
    expect(await response?.json()).toEqual({ ok: true, deferred: true })
    expect(sqlite.prepare('SELECT * FROM subscriptions').get()).toEqual(before)
  })
  it('replays a new subscription despite older unrelated Asaas events', async () => {
    const { env, sqlite } = setup()
    for (let index = 0; index < 20; index++) {
      const id = `other-project-${index}`
      sqlite.prepare('INSERT INTO pending_webhook_events (id, event_type, payload, received_at) VALUES (?, ?, ?, ?)')
        .run(id, 'SUBSCRIPTION_CREATED', JSON.stringify({ id, event: 'SUBSCRIPTION_CREATED', subscription: { id } }), '2026-09-01')
    }
    const early = new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'new-sub', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub-1', customer: 'cus-1' } }),
    })
    await handleSaaSRequest(early, env)
    const paid = new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id: 'new-paid', event: 'CHECKOUT_PAID', checkout: { id: 'checkout', customer: 'cus-1' } }),
    })
    expect((await handleSaaSRequest(paid, env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT asaas_subscription_id FROM subscriptions').get()?.asaas_subscription_id).toBe('sub-1')
    expect(sqlite.prepare("SELECT id FROM pending_webhook_events WHERE id = 'new-sub'").get()).toBeUndefined()
  })
  it('cannot downgrade a paid checkout with a late expiration event', async () => {
    const { env, sqlite } = setup()
    await handleSaaSRequest(eventRequest(), env)
    await handleSaaSRequest(eventRequest('event-2', 'CHECKOUT_EXPIRED'), env)
    expect(sqlite.prepare('SELECT status FROM checkout_sessions').get()?.status).toBe('paid')
  })
  it('does not extend access when a paid checkout arrives again with another event ID', async () => {
    const { env, sqlite } = setup()
    await handleSaaSRequest(eventRequest(), env)
    const first = sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end
    await handleSaaSRequest(eventRequest('another-event'), env)
    expect(sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end).toBe(first)
  })
  it('keeps the same period for confirmation and receipt of one Asaas payment', async () => {
    const { env, sqlite } = setup()
    await handleSaaSRequest(eventRequest(), env)
    const payment = (id: string, event: string) => new Request('https://test.invalid/webhooks/asaas', {
      method: 'POST', headers: { 'asaas-access-token': 'audit-only' },
      body: JSON.stringify({ id, event, payment: { id: 'pay-1', subscription: 'sub-1', dueDate: '2026-10-05' } }),
    })
    expect((await handleSaaSRequest(payment('confirmed', 'PAYMENT_CONFIRMED'), env))?.status).toBe(200)
    const end = sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end
    expect(end).toBe('2026-11-05T12:00:00.000Z')
    expect((await handleSaaSRequest(payment('received', 'PAYMENT_RECEIVED'), env))?.status).toBe(200)
    expect(sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end).toBe(end)
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
