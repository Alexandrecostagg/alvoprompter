import type { SaaSEnv } from './saas'

export function billingAvailability(env: SaaSEnv) {
  const base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  const sandbox = base === 'https://api-sandbox.asaas.com/v3'
  let validApp = false
  try {
    const app = new URL(env.APP_URL || '')
    validApp = !app.username && !app.password && (app.protocol === 'https:' || (app.protocol === 'http:' && app.hostname === 'localhost'))
  } catch { /* Missing or malformed callback URL: checkout stays unavailable. */ }
  return {
    configured: Boolean(env.ASAAS_API_KEY?.trim() && env.ASAAS_WEBHOOK_TOKEN?.trim() && env.DB && validApp && (sandbox || base === 'https://api.asaas.com/v3')),
    sandbox,
  }
}

/** Asaas returns the checkout ID; a `link` property is not required. */
export function checkoutUrl(id: string, sandbox: boolean) {
  const url = new URL('/checkoutSession/show', sandbox ? 'https://sandbox.asaas.com' : 'https://asaas.com')
  url.searchParams.set('id', id)
  return url.toString()
}
