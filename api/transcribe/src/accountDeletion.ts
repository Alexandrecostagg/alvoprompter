import type { AuthUser, SaaSEnv } from './saas'
import { asaasApiKey, asaasHeaders } from './billing'
import firebase from '../../../src/lib/firebase-config.json'

export interface DeletionEnv extends SaaSEnv {
  ACCOUNT_DELETION_KEY?: string
  ALVOPROMPT_SYNC?: KVNamespace
  alvoprompt_media?: R2Bucket
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
export async function resourceHash(value: string, prefix: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return `${prefix}:${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}
export const deletionHash = (uid: string) => resourceHash(uid, 'deleted')
export async function registerResource(db: D1Database, uid: string, kind: 'kv' | 'r2-prefix', key: string) {
  await db.prepare('INSERT OR IGNORE INTO account_resources (user_id,kind,resource_key) VALUES (?,?,?)').bind(await deletionHash(uid), kind, key).run()
}
export async function registerNamespace(db: D1Database, uid: string, pass: string) {
  const value = JSON.stringify([uid, pass])
  for (const prefix of ['sync', 'schedules', 'workspaces']) await registerResource(db, uid, 'kv', await resourceHash(value, prefix))
  await registerResource(db, uid, 'r2-prefix', `${await resourceHash(value, 'media')}:`)
}
interface DeletionJob { id: string; uid_hash: string; user_id: string | null; status: string; credential_cipher: string | null; credential_expires_at: number; email_verified: number; identity_deleted: number }
async function encrypt(env: DeletionEnv, plain: string): Promise<string> {
  if (!env.ACCOUNT_DELETION_KEY) throw new Error('Deletion encryption unavailable')
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(env.ACCOUNT_DELETION_KEY), c => c.charCodeAt(0)), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12)), cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  return btoa(String.fromCharCode(...iv, ...cipher))
}
async function decrypt(env: DeletionEnv, value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(env.ACCOUNT_DELETION_KEY!), c => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)))
}
export async function deletionStatus(db: D1Database, uid: string) {
  return db.prepare('SELECT id,status FROM account_deletions WHERE uid_hash=?').bind(await deletionHash(uid)).first<{ id: string; status: string }>()
}
/** Recover the durable outbox during authenticated account/admin visits; queue retries handle background work. */
export async function recoverAccountDeletions(env: DeletionEnv): Promise<void> {
  if (!env.DB || !env.BILLING_QUEUE) return
  const key = 'maintenance:account-deletions'
  if (await env.ALVOPROMPT_SYNC?.get(key)) return
  const jobs = await env.DB.prepare("SELECT d.id FROM account_deletions d WHERE d.status='pending' OR (d.status='complete' AND EXISTS (SELECT 1 FROM account_resources r WHERE r.user_id=d.uid_hash)) LIMIT 20").all<{ id: string }>()
  for (const job of jobs.results) await env.BILLING_QUEUE.send({ kind: 'account-delete', deletionId: job.id })
  if (jobs.results.length) await env.ALVOPROMPT_SYNC?.put(key, '1', { expirationTtl: 300 })
}
export async function deletionOverview(env: DeletionEnv, user: AuthUser) {
  const db = env.DB!
  const workspaces = await db.prepare('SELECT id,name FROM workspaces WHERE owner_id=?').bind(user.uid).all<{ id: string; name: string }>()
  const scopes = await db.prepare('SELECT workspace_id AS id FROM workspace_members WHERE user_id=?').bind(user.uid).all<{ id: string }>()
  const subscription = await db.prepare('SELECT provider,status FROM subscriptions WHERE user_id=?').bind(user.uid).first<{ provider: string; status: string }>()
  const deletion = await deletionStatus(db, user.uid)
  if (deletion?.status === 'pending' && env.BILLING_QUEUE) await env.BILLING_QUEUE.send({ kind: 'account-delete', deletionId: deletion.id }).catch(() => undefined)
  return json({ configured: Boolean(env.ACCOUNT_DELETION_KEY && env.BILLING_QUEUE), workspaces: workspaces.results, localWorkspaceIds: [...new Set([...scopes.results, ...workspaces.results].map(w => w.id))], appleSubscription: subscription?.provider === 'apple' && ['active','past_due','pending'].includes(subscription.status), deletion })
}

export async function startAccountDeletion(request: Request, env: DeletionEnv, user: AuthUser): Promise<Response> {
  if (!env.ACCOUNT_DELETION_KEY || !env.BILLING_QUEUE) return json({ error: 'A exclusão está temporariamente indisponível. Tente novamente mais tarde.' }, 503)
  const body = await request.json().catch(() => null) as { confirmation?: unknown; appleSubscriptionAcknowledged?: unknown } | null
  if (body?.confirmation !== 'EXCLUIR') return json({ error: 'Confirme a exclusão digitando EXCLUIR.' }, 400)
  if (!user.authTime || Date.now() / 1000 - user.authTime > 300) return json({ error: 'Confirme sua identidade novamente antes de excluir a conta.', code: 'REAUTHENTICATION_REQUIRED' }, 401)
  const db = env.DB!, existing = await deletionStatus(db, user.uid)
  if (existing?.status === 'complete') return json({ id: existing.id, status: 'complete' })
  const subscription = await db.prepare('SELECT provider,status FROM subscriptions WHERE user_id=?').bind(user.uid).first<{ provider: string; status: string }>()
  if (subscription?.provider === 'apple' && ['active','past_due','pending'].includes(subscription.status) && body.appleSubscriptionAcknowledged !== true) return json({ error: 'Confirme que compreendeu a necessidade de cancelar a renovação pela Apple.' }, 400)
  const pass = request.headers.get('x-sync-pass')?.trim()
  if (pass && pass.length >= 12 && pass.length <= 256) await registerNamespace(db, user.uid, pass)
  const token = request.headers.get('Authorization')!.slice(7).trim()
  const cipher = await encrypt(env, token), hash = await deletionHash(user.uid), id = existing?.id ?? crypto.randomUUID()
  await db.prepare(`INSERT INTO account_deletions (id,uid_hash,user_id,credential_cipher,credential_expires_at,email_verified,created_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(uid_hash) DO UPDATE SET credential_cipher=excluded.credential_cipher,credential_expires_at=excluded.credential_expires_at,status='pending' WHERE account_deletions.status<>'complete'`)
    .bind(id, hash, user.uid, cipher, user.tokenExpiresAt ?? Math.floor(Date.now() / 1000) + 3500, Number(user.emailVerified), new Date().toISOString()).run()
  // Persist first. Queue recovery can resume after a transient provider failure.
  try { await env.BILLING_QUEUE.send({ kind: 'account-delete', deletionId: id }) } catch { /* The status screen and authenticated account/admin visits recover persisted requests. */ }
  return json({ id, status: 'pending' }, 202)
}

async function cancelAsaas(env: DeletionEnv, uid: string) {
  const db = env.DB!, base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  const uncertain = await db.prepare('SELECT id FROM checkout_intents WHERE user_id=? AND asaas_checkout_id IS NULL AND created_at>? LIMIT 1').bind(uid, new Date(Date.now() - 3600000).toISOString()).first()
  if (uncertain) throw new Error('Checkout outcome not yet settled')
  const sub = await db.prepare("SELECT asaas_subscription_id AS id FROM subscriptions WHERE user_id=? AND provider='asaas' AND status IN ('active','past_due','pending')").bind(uid).first<{ id: string | null }>()
  const checkouts = await db.prepare("SELECT asaas_checkout_id AS id FROM checkout_sessions WHERE user_id=? AND status='pending'").bind(uid).all<{ id: string }>()
  if (!sub?.id && !checkouts.results.length) return
  if (!asaasApiKey(env)) throw new Error('Billing cancellation unavailable')
  const cancel = async (path: string, method = 'DELETE') => {
    const response = await fetch(`${base}${path}`, { method, headers: asaasHeaders(env), signal: AbortSignal.timeout(15000) })
    if (!response.ok && response.status !== 404) throw new Error('Billing cancellation pending')
  }
  if (sub?.id) await cancel(`/subscriptions/${encodeURIComponent(sub.id)}`)
  for (const checkout of checkouts.results) await cancel(`/checkouts/${encodeURIComponent(checkout.id)}/cancel`, 'POST')
}

export async function processAccountDeletion(env: DeletionEnv, id: string): Promise<void> {
  const db = env.DB!, job = await db.prepare('SELECT * FROM account_deletions WHERE id=?').bind(id).first<DeletionJob>()
  if (!job) return
  if (job.status === 'complete') { await deleteResources(env, job.uid_hash); return }
  if (!job.user_id) return
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_PROJECT_ID !== firebase.projectId) throw new Error('Deletion identity project mismatch')
  const uid = job.user_id
  if (!job.identity_deleted) {
    if (job.credential_expires_at <= Date.now() / 1000) {
      await db.prepare("UPDATE account_deletions SET status='needs_reauth',credential_cipher=NULL WHERE id=? AND identity_deleted=0 AND status<>'complete'").bind(id).run()
      return
    }
    await cancelAsaas(env, uid)
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebase.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: await decrypt(env, job.credential_cipher!) }), signal: AbortSignal.timeout(15000),
    })
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null
    if (!response.ok && result?.error?.message !== 'USER_NOT_FOUND') throw new Error('Identity deletion pending')
    await db.prepare('UPDATE account_deletions SET identity_deleted=1,credential_cipher=NULL WHERE id=?').bind(id).run()
  }
  await deleteResources(env, job.uid_hash)
  const user = await db.prepare('SELECT email FROM users WHERE id=?').bind(uid).first<{ email: string }>()
  // All owned workspaces are removed; other teams keep their content, with author NULL.
  await db.batch([
    db.prepare('DELETE FROM admin_notifications WHERE user_id=?').bind(uid),
    db.prepare("UPDATE admin_audit SET actor_id='deleted' WHERE actor_id=?").bind(uid),
    db.prepare("UPDATE app_policy_audit SET actor_id='deleted' WHERE actor_id=?").bind(uid),
    db.prepare("UPDATE app_policy SET actor_id=NULL WHERE actor_id=?").bind(uid),
    db.prepare('DELETE FROM workspaces WHERE owner_id=?').bind(uid),
    db.prepare('DELETE FROM workspace_members WHERE user_id=? OR (?=1 AND lower(invited_email)=lower(?))').bind(uid, job.email_verified, user?.email ?? ''),
    db.prepare('DELETE FROM users WHERE id=?').bind(uid),
    db.prepare("UPDATE account_deletions SET status='complete',user_id=NULL,credential_cipher=NULL,completed_at=? WHERE id=?").bind(new Date().toISOString(), id),
  ])
}

async function deleteResources(env: DeletionEnv, hash: string) {
  const db = env.DB!
  const resources = await db.prepare('SELECT kind,resource_key FROM account_resources WHERE user_id=?').bind(hash).all<{ kind: string; resource_key: string }>()
  for (const resource of resources.results) {
    if (resource.kind === 'kv') {
      if (!env.ALVOPROMPT_SYNC) throw new Error('KV cleanup unavailable')
      await env.ALVOPROMPT_SYNC.delete(resource.resource_key)
    } else {
      if (!env.alvoprompt_media) throw new Error('Media cleanup unavailable')
      let cursor: string | undefined
      do {
        const page = await env.alvoprompt_media.list({ prefix: resource.resource_key, limit: 500, cursor })
        if (page.objects.length) await env.alvoprompt_media.delete(page.objects.map(object => object.key))
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
    }
    await db.prepare('DELETE FROM account_resources WHERE user_id=? AND kind=? AND resource_key=?').bind(hash, resource.kind, resource.resource_key).run()
  }
}
