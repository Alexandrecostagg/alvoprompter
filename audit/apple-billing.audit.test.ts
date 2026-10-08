import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSaaSRequest, type SaaSEnv } from '../api/transcribe/src/saas'
import { APPLE_PRODUCTS, reconcileAppleSubscription } from '../api/transcribe/src/appleBilling'
import { testDatabase } from './d1-test-db'

vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }),
  importX509: async () => ({}),
  jwtVerify: async () => ({ payload: { auth_time: 1, sub: 'apple-user', email: 'apple@example.test', email_verified: true } }),
  importPKCS8: async () => ({}),
  decodeJwt: (value: string) => JSON.parse(value),
  SignJWT: class { setProtectedHeader() { return this } setIssuer() { return this } setAudience() { return this } setIssuedAt() { return this } setExpirationTime() { return this } async sign() { return 'signed-test-token' } },
}))
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const data = testDatabase()
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', APPLE_IAP_ISSUER_ID: 'test-issuer', APPLE_IAP_KEY_ID: 'test-key', APPLE_IAP_PRIVATE_KEY: 'test-private-key' }
  const request = (path: string, body?: unknown) => handleSaaSRequest(new Request(`https://test.invalid${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test' }, body: body ? JSON.stringify(body) : undefined,
  }), env)
  return { ...data, env, request }
}

describe('Apple subscription verification', () => {
  it('verifies a first TestFlight purchase when the unreleased production app returns 401', async () => {
    const { sqlite, request } = setup()
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('googleapis.com/robot')) return new Response(JSON.stringify({ test: 'certificate' }))
      if (String(url).includes('api.storekit.apple.com')) return new Response(null, { status: 401 })
      return new Response(JSON.stringify({ data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: JSON.stringify({
        appAccountToken: (sqlite.prepare('SELECT app_account_token FROM apple_accounts').get() as { app_account_token: string }).app_account_token,
        bundleId: 'com.alvoprompt.app', environment: 'Sandbox', originalTransactionId: '654321',
        transactionId: '654321', productId: APPLE_PRODUCTS.creator, expiresDate: Date.now() + 2_000_000,
      }) }] }] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    await request('/billing/apple/session')
    expect((await request('/billing/apple/verify', { transactionId: '654321' }))?.status).toBe(200)
    expect(sqlite.prepare('SELECT environment FROM apple_subscriptions').get()?.environment).toBe('Sandbox')
    expect(sqlite.prepare('SELECT provider, status FROM subscriptions').get()).toMatchObject({ provider: 'apple', status: 'active' })
  })
  it('does not switch environments for an already linked production purchase', async () => {
    const { db, env, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ test: 'certificate' }))))
    await request('/billing/apple/session')
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(reconcileAppleSubscription(db, env, 'apple-user', '654321', 'Production')).rejects.toThrow('Não foi possível confirmar')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('api.storekit.apple.com')
  })
  it('grants a paid plan only after the Apple API confirms its account token and bundle', async () => {
    const { sqlite, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot')
      ? new Response(JSON.stringify({ test: 'certificate' }))
      : new Response(JSON.stringify({ data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: JSON.stringify({
        appAccountToken: (sqlite.prepare('SELECT app_account_token FROM apple_accounts').get() as { app_account_token: string }).app_account_token,
        bundleId: 'com.alvoprompt.app', environment: 'Production', originalTransactionId: '123456',
        transactionId: '123456', productId: APPLE_PRODUCTS.creator, expiresDate: Date.now() + 2_000_000,
      }) }] }] }))))
    expect((await request('/billing/apple/session'))?.status).toBe(200)
    expect((await request('/billing/apple/verify', { transactionId: '123456' }))?.status).toBe(200)
    expect(sqlite.prepare('SELECT plan, provider, status FROM subscriptions').get()).toMatchObject({ plan: 'creator', provider: 'apple', status: 'active' })
  })

  it('refuses a purchase linked to another account and keeps the plan free', async () => {
    const { sqlite, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot')
      ? new Response(JSON.stringify({ test: 'certificate' }))
      : new Response(JSON.stringify({ data: [{ lastTransactions: [{ status: 1, signedTransactionInfo: JSON.stringify({
        appAccountToken: crypto.randomUUID(), bundleId: 'com.alvoprompt.app', environment: 'Production',
        originalTransactionId: '123456', productId: APPLE_PRODUCTS.studio, expiresDate: Date.now() + 2_000_000,
      }) }] }] }))))
    await request('/billing/apple/session')
    expect((await request('/billing/apple/verify', { transactionId: '123456' }))?.status).toBe(403)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()?.n).toBe(0)
  })
  it('keeps access during the Apple billing grace period', async () => {
    const { sqlite, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ test: 'certificate' }))))
    await request('/billing/apple/session')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot')
      ? new Response(JSON.stringify({ test: 'certificate' }))
      : new Response(JSON.stringify({ data: [{ lastTransactions: [{ status: 4, signedTransactionInfo: JSON.stringify({
        appAccountToken: (sqlite.prepare('SELECT app_account_token FROM apple_accounts').get() as { app_account_token: string }).app_account_token,
        bundleId: 'com.alvoprompt.app', environment: 'Production', originalTransactionId: '654321',
        productId: APPLE_PRODUCTS.studio, expiresDate: Date.now() - 100_000,
      }), signedRenewalInfo: JSON.stringify({ gracePeriodExpiresDate: Date.now() + 2_000_000 }) }] }] }))))
    expect((await request('/billing/apple/verify', { transactionId: '654321' }))?.status).toBe(200)
    expect(sqlite.prepare('SELECT plan, status FROM subscriptions').get()).toMatchObject({ plan: 'studio', status: 'active' })
  })
  it('reconciles renewal and preserves access after auto-renew is disabled until expiry', async () => {
    const { sqlite, request } = setup()
    let expiry = Date.now() + 86_400_000
    let status = 1
    let renewalEnabled = 1
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot')
      ? new Response(JSON.stringify({ test: 'certificate' }))
      : new Response(JSON.stringify({ data: [{ lastTransactions: [{ status, signedTransactionInfo: JSON.stringify({
        appAccountToken: (sqlite.prepare('SELECT app_account_token FROM apple_accounts').get() as { app_account_token: string }).app_account_token,
        bundleId: 'com.alvoprompt.app', environment: 'Production', originalTransactionId: '123456',
        transactionId: '123457', productId: APPLE_PRODUCTS.creator, expiresDate: expiry,
      }), signedRenewalInfo: JSON.stringify({ autoRenewStatus: renewalEnabled }) }] }] }))))
    await request('/billing/apple/session')
    await request('/billing/apple/verify', { transactionId: '123456' })
    expiry += 86_400_000
    expect((await request('/account'))?.status).toBe(200)
    expect(sqlite.prepare('SELECT current_period_end FROM subscriptions').get()?.current_period_end).toBe(new Date(expiry).toISOString())
    renewalEnabled = 0
    await request('/account')
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('active')
    expiry = Date.now() - 1000
    status = 2
    await request('/account')
    expect(sqlite.prepare('SELECT status FROM subscriptions').get()?.status).toBe('canceled')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()?.n).toBe(1)
  })
  it.each([
    { status: 5, revoked: true, expected: 'canceled' },
    { status: 3, revoked: false, expected: 'past_due' },
  ])('removes paid access for Apple state $status', async ({ status, revoked, expected }) => {
    const { sqlite, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('googleapis.com/robot')
      ? new Response(JSON.stringify({ test: 'certificate' }))
      : new Response(JSON.stringify({ data: [{ lastTransactions: [{ status, signedTransactionInfo: JSON.stringify({
        appAccountToken: (sqlite.prepare('SELECT app_account_token FROM apple_accounts').get() as { app_account_token: string }).app_account_token,
        bundleId: 'com.alvoprompt.app', environment: 'Production', originalTransactionId: '123456',
        productId: APPLE_PRODUCTS.creator, expiresDate: Date.now() + 86_400_000,
        ...(revoked ? { revocationDate: Date.now() } : {}),
      }) }] }] }))))
    await request('/billing/apple/session')
    const result = await request('/billing/apple/verify', { transactionId: '123456' })
    expect(await result?.json()).toMatchObject({ plan: 'free', status: expected })
  })
  it('refuses to replace a paid Asaas subscription with an Apple receipt', async () => {
    const { sqlite, request } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ test: 'certificate' }))))
    await request('/billing/apple/session')
    sqlite.exec(`INSERT INTO subscriptions (id,user_id,plan,status,asaas_subscription_id,current_period_end,created_at,updated_at)
      VALUES ('web','apple-user','creator','active','sub-web','2099-01-01','2026-01-01','2026-01-01')`)
    expect((await request('/billing/apple/verify', { transactionId: '123456' }))?.status).toBe(409)
    expect(sqlite.prepare('SELECT provider, plan FROM subscriptions').get()).toMatchObject({ provider: 'asaas', plan: 'creator' })
  })
})
