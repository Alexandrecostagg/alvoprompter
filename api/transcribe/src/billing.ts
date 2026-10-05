import type { SaaSEnv } from './saas'

/** New Asaas accounts require an explicit application identity on every request. */
export function asaasHeaders(env: SaaSEnv): Record<string, string> {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'AlvoPrompter/1.5.0',
    access_token: asaasApiKey(env) ?? '',
  }
}

/** Store only recognized machine codes, never provider messages or credentials. */
export function asaasFailureCode(status: number, result: unknown): string {
  const errors = (result as { errors?: unknown } | null)?.errors
  const known = new Set(['invalid_access_token', 'invalid_environment', 'access_token_not_found', 'invalid_object', 'invalid_user_agent', 'user_agent_not_found'])
  if (Array.isArray(errors)) {
    for (const error of errors) {
      if (known.has(error?.code)) return error.code
    }
  }
  if (status === 401) return 'authentication_failed'
  if (status === 403) return 'request_forbidden'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_unavailable'
  return status >= 200 && status < 300 ? 'invalid_response' : 'request_rejected'
}

export function asaasApiKey(env: SaaSEnv): string | undefined {
  const base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  if (base === 'https://api-sandbox.asaas.com/v3') return env.ASAAS_API_KEY?.trim()
  if (base === 'https://api.asaas.com/v3') return env.ASAAS_PRODUCTION_API_KEY?.trim()
  return undefined
}

export function billingAvailability(env: SaaSEnv) {
  const base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  const sandbox = base === 'https://api-sandbox.asaas.com/v3'
  let validApp = false
  try {
    const app = new URL(env.APP_URL || '')
    validApp = !app.username && !app.password && (app.protocol === 'https:' || (app.protocol === 'http:' && app.hostname === 'localhost'))
  } catch { /* Missing or malformed callback URL: checkout stays unavailable. */ }
  return {
    configured: Boolean(asaasApiKey(env) && env.ASAAS_WEBHOOK_TOKEN?.trim() && env.DB && validApp),
    sandbox,
  }
}

/** Asaas returns the checkout ID; a `link` property is not required. */
export function checkoutUrl(id: string, sandbox: boolean) {
  const url = new URL('/checkoutSession/show', sandbox ? 'https://sandbox.asaas.com' : 'https://asaas.com')
  url.searchParams.set('id', id)
  return url.toString()
}
