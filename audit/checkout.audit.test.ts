import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSaaSRequest, type SaaSEnv } from '../api/transcribe/src/saas'
import { billingAvailability } from '../api/transcribe/src/billing'
import { testDatabase } from './d1-test-db'
vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'test' }), importX509: async () => ({}),
  jwtVerify: async () => ({ payload: { sub: 'checkout-user', email: 'checkout@example.test', email_verified: true } }),
}))
afterEach(() => vi.unstubAllGlobals())
function setup(overrides: Partial<SaaSEnv> = {}, reply: unknown = { id: 'checkout-123' }, status = 200) {
  const data = testDatabase()
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', APP_URL: 'https://app.example.test', ASAAS_API_KEY: 'test-only', ASAAS_WEBHOOK_TOKEN: 'test-only', ...overrides }
  const provider = vi.fn(async () => new Response(JSON.stringify(reply), { status }))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('googleapis.com/robot')) return new Response(JSON.stringify({ test: 'certificate' }))
    if (init?.body) {
      const payload = JSON.parse(String(init.body))
      expect(payload.billingTypes).toEqual(['CREDIT_CARD'])
      expect(payload.chargeTypes).toEqual(['RECURRENT'])
      expect(payload.customerData).toBeUndefined()
      expect(payload.subscription.cycle).toBe('MONTHLY')
    }
    return provider()
  }))
  const request = () => handleSaaSRequest(new Request('https://test.invalid/billing/checkout', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ plan: 'creator' }) }), env)
  return { ...data, env, request, provider }
}
describe('checkout availability and Asaas ID response', () => {
  it.each([{ ASAAS_API_KEY: undefined }, { ASAAS_WEBHOOK_TOKEN: undefined }, { APP_URL: '' }])('blocks incomplete configuration without creating a checkout: %j', async (overrides) => {
    const { env, request, provider } = setup(overrides)
    expect(billingAvailability(env).configured).toBe(false)
    const response = await request()
    expect(response?.status).toBe(503)
    expect(await response?.json()).toMatchObject({ code: 'BILLING_UNAVAILABLE' })
    expect(provider).not.toHaveBeenCalled()
  })
  it.each([
    ['https://api-sandbox.asaas.com/v3', 'https://sandbox.asaas.com/checkoutSession/show?id=checkout-123'],
    ['https://api.asaas.com/v3', 'https://asaas.com/checkoutSession/show?id=checkout-123'],
  ])('persists a pending checkout from an ID-only reply: %s', async (base, url) => {
    const { request, sqlite } = setup({ ASAAS_API_BASE: base })
    const response = await request()
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ url })
    expect(sqlite.prepare('SELECT status, checkout_url FROM checkout_sessions').get()).toMatchObject({ status: 'pending', checkout_url: url })
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get()?.n).toBe(0)
  })
  it('does not persist an upstream rejection or expose provider details', async () => {
    const { request, sqlite } = setup({}, { errors: ['private provider detail'] }, 401)
    const response = await request()
    expect(response?.status).toBe(502)
    expect(await response?.text()).not.toContain('private provider detail')
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM checkout_sessions').get()?.n).toBe(0)
  })
})
