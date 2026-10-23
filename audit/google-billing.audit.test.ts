import { afterEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_PRODUCTS, googleAccountToken, googleBillingConfigured, reconcileGoogleSubscription, refreshGoogleAccount } from '../api/transcribe/src/googleBilling'
import type { SaaSEnv } from '../api/transcribe/src/saas'
import { testDatabase } from './d1-test-db'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

vi.mock('jose', () => ({ importPKCS8: async () => ({}), SignJWT: class {
  setProtectedHeader() { return this } setIssuer() { return this } setAudience() { return this } setIssuedAt() { return this } setExpirationTime() { return this } async sign() { return 'assertion' }
} }))
afterEach(() => vi.unstubAllGlobals())
async function setup() {
  const data = testDatabase()
  data.sqlite.exec("INSERT INTO users (id,email,name,created_at,updated_at) VALUES ('buyer','buyer@example.test','Buyer','2026','2026')")
  const env: SaaSEnv = { DB: data.db, GOOGLE_PLAY_ENABLED: 'true', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.test', private_key: 'test' }), BILLING_ENCRYPTION_KEY: btoa('a'.repeat(32)) }
  const accountToken = await googleAccountToken(data.db, 'buyer')
  const payload = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', externalAccountIdentifiers: { obfuscatedExternalAccountId: accountToken },
    lineItems: [{ productId: GOOGLE_PRODUCTS.creator, expiryTime: new Date(Date.now() + 86_400_000).toISOString(), offerDetails: { basePlanId: 'mensal' } }] }
  const fetchMock = vi.fn(async (url: string) => url.includes('oauth2.googleapis.com') ? Response.json({ access_token: 'access' }) : url.endsWith(':acknowledge') ? new Response(null, { status: 204 }) : Response.json(payload))
  vi.stubGlobal('fetch', fetchMock)
  return { ...data, env, payload, fetchMock, run: (token = 'valid-purchase-token') => reconcileGoogleSubscription(data.db, env, 'buyer', token) }
}
describe('Google Play server verification', () => {
  it('preserves existing subscription fields and constraints when extending the provider migration', () => {
    const sqlite = new DatabaseSync(':memory:')
    for (const name of readdirSync('api/transcribe/migrations').sort().filter(name => name < '0013')) sqlite.exec(readFileSync(`api/transcribe/migrations/${name}`, 'utf8'))
    sqlite.exec("INSERT INTO users (id,email,name,created_at,updated_at) VALUES ('existing','existing@example.test','Existing','2026','2026'); INSERT INTO subscriptions (id,user_id,plan,status,asaas_subscription_id,asaas_customer_id,current_period_end,created_at,updated_at,cancellation_reason,provider,asaas_last_paid_payment_id) VALUES ('sub','existing','studio','canceled','sub_1','cus_1','2099-01-01','2026','2026','requested','asaas','pay_1')")
    const before = sqlite.prepare('SELECT * FROM subscriptions').get()
    sqlite.exec(readFileSync('api/transcribe/migrations/0013_google_billing.sql', 'utf8'))
    expect(sqlite.prepare('SELECT * FROM subscriptions').get()).toEqual(before)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => sqlite.exec("UPDATE subscriptions SET provider='invalid'")).toThrow()
    sqlite.close()
  })
  it('is disabled without an explicit release gate and credentials', () => {
    expect(googleBillingConfigured({ GOOGLE_PLAY_ENABLED: 'false' })).toBe(false)
    expect(googleBillingConfigured({ GOOGLE_PLAY_ENABLED: 'true' })).toBe(false)
  })
  it('verifies ownership/product/expiry, acknowledges server-side and encrypts the saved token', async () => {
    const { run, sqlite, fetchMock } = await setup()
    expect(await run()).toMatchObject({ plan: 'creator', status: 'active' })
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith(':acknowledge'))).toBe(true)
    expect(sqlite.prepare('SELECT provider,status FROM subscriptions').get()).toMatchObject({ provider: 'google', status: 'active' })
    const saved = sqlite.prepare('SELECT token_hash,token_cipher FROM google_subscriptions').get()!
    expect(saved.token_cipher).not.toContain('valid-purchase-token')
    expect(saved.token_hash).toHaveLength(64)
  })
  it('refuses another app account before acknowledgement or entitlement', async () => {
    const { run, payload, sqlite, fetchMock } = await setup()
    payload.externalAccountIdentifiers.obfuscatedExternalAccountId = 'someone-else'
    await expect(run()).rejects.toThrow('não pertence')
    expect(sqlite.prepare('SELECT COUNT(*) n FROM subscriptions').get()?.n).toBe(0)
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith(':acknowledge'))).toBe(false)
  })
  it.each(['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'])('does not grant access for %s', async state => {
    const { run, payload } = await setup(); payload.subscriptionState = state
    expect(await run()).toMatchObject({ plan: 'free' })
  })
  it('retains access after renewal cancellation only through verified expiry', async () => {
    const { run, payload } = await setup(); payload.subscriptionState = 'SUBSCRIPTION_STATE_CANCELED'
    expect(await run()).toMatchObject({ plan: 'creator' })
    payload.lineItems[0]!.expiryTime = new Date(Date.now() - 1000).toISOString()
    expect(await run()).toMatchObject({ plan: 'free', status: 'canceled' })
  })
  it('does not unlock or replace an existing plan for a pending payment', async () => {
    const { run, payload, sqlite } = await setup(); await run()
    payload.subscriptionState = 'SUBSCRIPTION_STATE_PENDING'
    expect(await run('pending-token')).toMatchObject({ status: 'pending', plan: 'free' })
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('active')
  })
  it('fails closed when acknowledgement fails', async () => {
    const { run, fetchMock, sqlite, payload } = await setup()
    fetchMock.mockImplementation(async url => url.includes('oauth2.googleapis.com') ? Response.json({ access_token: 'access' }) : url.endsWith(':acknowledge') ? new Response(null, { status: 503 }) : Response.json(payload))
    await expect(run()).rejects.toThrow('Restaure')
    expect(sqlite.prepare('SELECT COUNT(*) n FROM subscriptions').get()?.n).toBe(0)
  })
  it('does not accept an unknown base plan', async () => {
    const { run, payload } = await setup(); payload.lineItems[0]!.offerDetails.basePlanId = 'annual'
    await expect(run()).rejects.toThrow('não reconhecido')
  })
  it('refreshes from the encrypted token but never overwrites another current provider', async () => {
    const { run, db, env, payload, sqlite, fetchMock } = await setup(); await run()
    payload.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED'
    await refreshGoogleAccount(db, env, 'buyer')
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('canceled')
    sqlite.exec("UPDATE subscriptions SET provider='apple',status='active'")
    fetchMock.mockClear(); await refreshGoogleAccount(db, env, 'buyer')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
