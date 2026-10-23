import { decodeJwt, importPKCS8, SignJWT } from 'jose'
import type { SaaSEnv, SaaSPlan } from './saas'

export const APPLE_PRODUCTS = {
  creator: 'com.alvoprompt.app.creator.monthly',
  studio: 'com.alvoprompt.app.studio.monthly',
} as const
const BUNDLE_ID = 'com.alvoprompt.app'

export class AppleBillingError extends Error {
  constructor(message: string, readonly code: string) { super(message) }
}

interface AppleTransaction {
  appAccountToken?: string
  bundleId?: string
  environment?: string
  expiresDate?: number
  originalTransactionId?: string
  productId?: string
  revocationDate?: number
  transactionId?: string
}
interface AppleStatus {
  data?: { lastTransactions?: { status?: number; signedTransactionInfo?: string; signedRenewalInfo?: string }[] }[]
}
interface AppleRenewal { gracePeriodExpiresDate?: number }

export function appleBillingConfigured(env: SaaSEnv): boolean {
  return Boolean(env.APPLE_IAP_ISSUER_ID?.trim() && env.APPLE_IAP_KEY_ID?.trim() && env.APPLE_IAP_PRIVATE_KEY?.trim() && env.DB)
}

async function authorization(env: SaaSEnv): Promise<string> {
  const key = await importPKCS8(env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'ES256')
  return new SignJWT({ bid: BUNDLE_ID })
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_IAP_KEY_ID!, typ: 'JWT' })
    .setIssuer(env.APPLE_IAP_ISSUER_ID!)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

/** The JWS is decoded only after it arrives from Apple's authenticated HTTPS API. */
function transactionFromApple(jws: string): AppleTransaction | null {
  try { return decodeJwt(jws) as AppleTransaction }
  catch { return null }
}

async function fetchStatus(env: SaaSEnv, transactionId: string, environment?: string): Promise<{ status: AppleStatus; environment: 'Production' | 'Sandbox' }> {
  if (!appleBillingConfigured(env)) throw new Error('Compras Apple ainda não configuradas no servidor.')
  if (!/^[0-9]{1,32}$/.test(transactionId)) throw new Error('Transação Apple inválida.')
  let jwt: string
  try { jwt = await authorization(env) }
  catch { throw new AppleBillingError('A validação de compras da Apple está indisponível. Sua compra não precisa ser repetida; tente Restaurar compras mais tarde.', 'APPLE_CREDENTIAL_UNAVAILABLE') }
  const environments = environment === 'Sandbox' ? ['Sandbox'] as const : environment === 'Production' ? ['Production'] as const : ['Production', 'Sandbox'] as const
  for (const target of environments) {
    const host = target === 'Sandbox' ? 'api.storekit-sandbox.apple.com' : 'api.storekit.apple.com'
    let response: Response
    try {
      response = await fetch(`https://${host}/inApps/v1/subscriptions/${transactionId}`, {
        headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
    } catch { throw new AppleBillingError('A Apple não respondeu à validação da compra. Não compre novamente; tente Restaurar compras em instantes.', 'APPLE_VERIFICATION_TIMEOUT') }
    // An app not yet released can return 401 in Production while the same key
    // authenticates in Sandbox. First purchases must still reach TestFlight.
    // Once linked, the stored environment is used exclusively.
    if (environments.length > 1 && target === 'Production' && [401, 404].includes(response.status)) continue
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'APPLE_CREDENTIAL_REJECTED'
        : response.status === 404 ? 'APPLE_TRANSACTION_NOT_READY' : 'APPLE_VERIFICATION_UNAVAILABLE'
      const message = code === 'APPLE_CREDENTIAL_REJECTED'
        ? 'Não foi possível confirmar a assinatura: a conexão de validação do AlvoPrompter com a Apple precisa ser verificada pela equipe. Não compre novamente.'
        : code === 'APPLE_TRANSACTION_NOT_READY'
          ? 'A Apple ainda não disponibilizou esta compra para validação. Aguarde um pouco e tente Restaurar compras; não compre novamente.'
          : 'Não foi possível confirmar a assinatura com a Apple. Não compre novamente; tente Restaurar compras em instantes.'
      throw new AppleBillingError(message, code)
    }
    return { status: await response.json() as AppleStatus, environment: target }
  }
  throw new Error('Assinatura não encontrada na Apple.')
}

export async function appleAccountToken(db: D1Database, uid: string): Promise<string> {
  const existing = await db.prepare('SELECT app_account_token FROM apple_accounts WHERE user_id = ?').bind(uid).first<{ app_account_token: string }>()
  if (existing) return existing.app_account_token
  const token = crypto.randomUUID()
  await db.prepare('INSERT OR IGNORE INTO apple_accounts (user_id, app_account_token, created_at) VALUES (?, ?, ?)')
    .bind(uid, token, new Date().toISOString()).run()
  const saved = await db.prepare('SELECT app_account_token FROM apple_accounts WHERE user_id = ?').bind(uid).first<{ app_account_token: string }>()
  if (!saved) throw new Error('Não foi possível preparar a compra Apple.')
  return saved.app_account_token
}

export async function reconcileAppleSubscription(db: D1Database, env: SaaSEnv, uid: string, transactionId: string, environment?: string): Promise<{ plan: SaaSPlan; status: string; currentPeriodEnd: string | null }> {
  const token = await appleAccountToken(db, uid)
  const { status: appleStatus, environment: verifiedEnvironment } = await fetchStatus(env, transactionId, environment)
  const matches = (appleStatus.data ?? []).flatMap((group) => group.lastTransactions ?? [])
    .map((item) => ({ item, transaction: item.signedTransactionInfo ? transactionFromApple(item.signedTransactionInfo) : null,
      renewal: item.signedRenewalInfo ? transactionFromApple(item.signedRenewalInfo) as AppleRenewal | null : null }))
    .filter(({ transaction }) => transaction?.appAccountToken?.toLowerCase() === token.toLowerCase()
      && transaction.bundleId === BUNDLE_ID
      && transaction.environment === verifiedEnvironment
      && Object.values(APPLE_PRODUCTS).includes(transaction.productId as typeof APPLE_PRODUCTS[keyof typeof APPLE_PRODUCTS]))
  if (!matches.length) throw new Error('Esta compra Apple não pertence à sua conta AlvoPrompter.')
  const entitlementEnd = (match: typeof matches[number]) => match.item.status === 4
    ? Number(match.renewal?.gracePeriodExpiresDate ?? 0) : Number(match.transaction?.expiresDate ?? 0)
  matches.sort((a, b) => {
    const aValid = !a.transaction?.revocationDate && (a.item.status === 1 || a.item.status === 4) && entitlementEnd(a) > Date.now()
    const bValid = !b.transaction?.revocationDate && (b.item.status === 1 || b.item.status === 4) && entitlementEnd(b) > Date.now()
    return Number(bValid) - Number(aValid) || entitlementEnd(b) - entitlementEnd(a)
  })
  const selected = matches[0]!
  const transaction = selected.transaction!
  if (!transaction.originalTransactionId || !/^[0-9]{1,32}$/.test(transaction.originalTransactionId)) throw new Error('Transação Apple incompleta.')
  const owner = await db.prepare('SELECT user_id FROM apple_subscriptions WHERE original_transaction_id = ?')
    .bind(transaction.originalTransactionId).first<{ user_id: string }>()
  if (owner && owner.user_id !== uid) throw new Error('Esta assinatura Apple já está vinculada a outra conta.')
  const plan: SaaSPlan = transaction.productId === APPLE_PRODUCTS.studio ? 'studio' : 'creator'
  const expires = entitlementEnd(selected)
  const valid = !transaction.revocationDate && (selected.item.status === 1 || selected.item.status === 4) && expires > Date.now()
  const state = valid ? 'active' : selected.item.status === 3 ? 'past_due' : 'canceled'
  const end = expires > 0 ? new Date(expires).toISOString() : null
  const now = new Date().toISOString()
  await db.batch([
    db.prepare(`INSERT INTO apple_subscriptions (original_transaction_id, user_id, product_id, environment, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET original_transaction_id = excluded.original_transaction_id,
      product_id = excluded.product_id, environment = excluded.environment, updated_at = excluded.updated_at`)
      .bind(transaction.originalTransactionId, uid, transaction.productId, verifiedEnvironment, now),
    db.prepare(`INSERT INTO subscriptions (id, user_id, plan, status, current_period_end, created_at, updated_at, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'apple') ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status,
      current_period_end = excluded.current_period_end, updated_at = excluded.updated_at, provider = 'apple',
      asaas_subscription_id = NULL, asaas_customer_id = NULL`)
      .bind(crypto.randomUUID(), uid, plan, state, end, now, now),
  ])
  return { plan: valid ? plan : 'free', status: state, currentPeriodEnd: end }
}

export async function refreshAppleAccount(db: D1Database, env: SaaSEnv, uid: string): Promise<void> {
  const linked = await db.prepare("SELECT a.original_transaction_id, a.environment FROM apple_subscriptions a JOIN subscriptions s ON s.user_id=a.user_id AND s.provider='apple' WHERE a.user_id = ?")
    .bind(uid).first<{ original_transaction_id: string; environment: string }>()
  if (linked) await reconcileAppleSubscription(db, env, uid, linked.original_transaction_id, linked.environment)
}
