import { importPKCS8, SignJWT } from 'jose'
import type { SaaSEnv } from './saas'

export const GOOGLE_PRODUCTS = { creator: 'com.alvoprompt.app.creator.monthly', studio: 'com.alvoprompt.app.studio.monthly' } as const
export const GOOGLE_BASE_PLAN = 'mensal'
const PACKAGE = 'com.alvoprompt.app'
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`
export function googleBillingConfigured(env: SaaSEnv): boolean {
  return env.GOOGLE_PLAY_ENABLED === 'true' && Boolean(env.DB && env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && env.BILLING_ENCRYPTION_KEY)
}
export async function googleAccountToken(db: D1Database, uid: string): Promise<string> {
  await db.prepare('INSERT OR IGNORE INTO google_accounts (user_id, account_token) VALUES (?, ?)').bind(uid, crypto.randomUUID()).run()
  return (await db.prepare('SELECT account_token FROM google_accounts WHERE user_id=?').bind(uid).first<{ account_token: string }>())!.account_token
}
async function authorization(env: SaaSEnv): Promise<string> {
  const credential = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!) as { client_email: string; private_key: string }
  const key = await importPKCS8(credential.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(credential.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m').sign(key)
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10_000) })
  const token = await response.json() as { access_token?: string }
  if (!response.ok || !token.access_token) throw new Error('Não foi possível consultar o Google Play.')
  return token.access_token
}
async function tokenHash(token: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
}
async function tokenCipher(env: SaaSEnv, value: string, decrypt = false): Promise<string> {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(env.BILLING_ENCRYPTION_KEY!), c => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt', 'decrypt'])
  const aad = new TextEncoder().encode('alvoprompter:google-purchase:v1')
  if (decrypt) {
    const data = Uint8Array.from(atob(value), c => c.charCodeAt(0))
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: aad }, key, data.slice(12)))
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...iv, ...data))
}
interface GoogleSubscription {
  subscriptionState?: string
  acknowledgementState?: string
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string }
  lineItems?: { productId?: string; expiryTime?: string; offerDetails?: { basePlanId?: string }; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[]
}
export async function reconcileGoogleSubscription(db: D1Database, env: SaaSEnv, uid: string, token: string) {
  if (!googleBillingConfigured(env)) throw new Error('Compras Google Play ainda não configuradas.')
  if (!token || token.length > 4096 || (/\s/.test(token) || [...token].some(c => c.charCodeAt(0) < 32))) throw new Error('Compra Google Play inválida.')
  const accessToken = await authorization(env)
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const response = await fetch(`${API}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Não foi possível confirmar a assinatura com o Google Play.')
  const purchase = await response.json() as GoogleSubscription
  if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== await googleAccountToken(db, uid)) throw new Error('Esta compra não pertence à sua conta.')
  const hash = await tokenHash(token)
  const owner = await db.prepare('SELECT user_id FROM google_subscriptions WHERE token_hash=?').bind(hash).first<{ user_id: string }>()
  if (owner && owner.user_id !== uid) throw new Error('Esta assinatura está vinculada a outra conta.')
  // Only the explicitly configured monthly base plans are supported in this release.
  const item = purchase.lineItems?.filter(i => Object.values(GOOGLE_PRODUCTS).includes(i.productId as typeof GOOGLE_PRODUCTS.creator) && i.offerDetails?.basePlanId === GOOGLE_BASE_PLAN)
    .sort((a, b) => Date.parse(b.expiryTime ?? '') - Date.parse(a.expiryTime ?? ''))[0]
  if (!item) throw new Error('Produto Google Play não reconhecido.')
  const end = Date.parse(item.expiryTime ?? '')
  const valid = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(purchase.subscriptionState ?? '') && Number.isFinite(end) && end > Date.now()
  // Pending payments never unlock access or replace a verified existing subscription.
  if (purchase.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') return { plan: 'free' as const, status: 'pending', currentPeriodEnd: null }
  if (valid && purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
    const ack = await fetch(`${API}/purchases/subscriptions/${encodeURIComponent(item.productId!)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10_000) })
    if (!ack.ok) throw new Error('Não foi possível concluir a confirmação com o Google Play. Restaure a compra para tentar novamente.')
  }
  const plan = item.productId === GOOGLE_PRODUCTS.studio ? 'studio' : 'creator'
  const state = valid ? 'active' : purchase.subscriptionState === 'SUBSCRIPTION_STATE_ON_HOLD' ? 'past_due' : 'canceled'
  const now = new Date().toISOString(), expiry = Number.isFinite(end) ? new Date(end).toISOString() : null
  await db.batch([
    db.prepare(`INSERT INTO google_subscriptions (token_hash,user_id,token_cipher,product_id,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,token_cipher=excluded.token_cipher,product_id=excluded.product_id,updated_at=excluded.updated_at`)
      .bind(hash, uid, await tokenCipher(env, token), item.productId!, now),
    db.prepare(`INSERT INTO subscriptions (id,user_id,plan,status,current_period_end,created_at,updated_at,provider) VALUES (?,?,?,?,?,?,?,'google')
      ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,current_period_end=excluded.current_period_end,updated_at=excluded.updated_at,provider='google',asaas_subscription_id=NULL,asaas_customer_id=NULL`)
      .bind(crypto.randomUUID(), uid, plan, state, expiry, now, now),
  ])
  return { plan: valid ? plan : 'free', status: state, currentPeriodEnd: expiry }
}
export async function refreshGoogleAccount(db: D1Database, env: SaaSEnv, uid: string) {
  const linked = await db.prepare("SELECT g.token_cipher FROM google_subscriptions g JOIN subscriptions s ON s.user_id=g.user_id AND s.provider='google' WHERE g.user_id=?").bind(uid).first<{ token_cipher: string }>()
  if (linked) await reconcileGoogleSubscription(db, env, uid, await tokenCipher(env, linked.token_cipher, true))
}
