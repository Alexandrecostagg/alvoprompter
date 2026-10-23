import type { SaaSEnv, SaaSPlan, AuthUser } from './saas'
import { asaasHeaders, billingAvailability } from './billing'
import { adminAppPolicy } from './appPolicy'

export type BillingMessage = { id: string } | { kind: 'access-review'; userId: string; revision: string } | { kind: 'admin-email'; notificationId: string } | { kind: 'account-delete'; deletionId: string }
export interface AccessGrant { user_id: string; plan: Exclude<SaaSPlan, 'free'>; status: 'active' | 'revoked'; expires_at: string; revision: string; reason: string; actor_id: string; updated_at: string; timer_status: string }
const DAY = 86_400_000
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const paidPlan = (plan: unknown): plan is 'creator' | 'studio' => plan === 'creator' || plan === 'studio'
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function isPlatformAdmin(env: SaaSEnv, user: AuthUser): boolean {
  return user.emailVerified && (env.ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(user.uid)
}
export function adminEmailConfigured(env: SaaSEnv): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.ADMIN_EMAIL_FROM?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_NOTIFY_EMAIL ?? ''))
}
export async function readGrant(db: D1Database, uid: string): Promise<AccessGrant | null> {
  return db.prepare('SELECT * FROM access_grants WHERE user_id = ?').bind(uid).first<AccessGrant>()
}
export function grantIsActive(grant: AccessGrant | null, now = Date.now()): boolean {
  return grant?.status === 'active' && Date.parse(grant.expires_at) > now
}
export async function accessSummary(db: D1Database, uid: string) {
  const grant = await readGrant(db, uid)
  const request = await db.prepare('SELECT plan,status,updated_at AS updatedAt FROM access_requests WHERE user_id = ?').bind(uid).first()
  return { grant: grant ? { plan: grant.plan, status: grantIsActive(grant) ? 'active' : grant.status === 'revoked' ? 'revoked' : 'expired', expiresAt: grant.expires_at } : null, request }
}

async function notify(env: SaaSEnv, id: string, uid: string | null, kind: string, title: string, body: string) {
  await env.DB!.prepare(`INSERT OR IGNORE INTO admin_notifications (id,user_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(id, uid, kind, title, body, new Date().toISOString()).run()
  if (env.BILLING_QUEUE) await env.BILLING_QUEUE.send({ kind: 'admin-email', notificationId: id })
}

export async function requestAccess(request: Request, env: SaaSEnv, user: AuthUser): Promise<Response> {
  if (!user.emailVerified) return json({ error: 'Confirme seu e-mail antes de solicitar acesso.' }, 403)
  const body = await request.json().catch(() => null) as { plan?: unknown } | null
  if (!paidPlan(body?.plan)) return json({ error: 'Escolha Criador ou Studio.' }, 400)
  const db = env.DB!
  const existing = await db.prepare('SELECT status FROM access_requests WHERE user_id = ?').bind(user.uid).first<{ status: string }>()
  if (existing?.status === 'pending') return json({ error: 'Sua solicitação já está aguardando análise.' }, 409)
  const revision = crypto.randomUUID(), now = new Date().toISOString()
  const result = await db.prepare(`INSERT INTO access_requests (user_id,plan,status,revision,created_at,updated_at) VALUES (?,?,'pending',?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status='pending',revision=excluded.revision,updated_at=excluded.updated_at WHERE access_requests.status <> 'pending'`)
    .bind(user.uid, body.plan, revision, now, now).run()
  if (!result.meta.changes) return json({ error: 'Sua solicitação já está aguardando análise.' }, 409)
  // A durable notification remains visible even if the queue is temporarily unavailable.
  try { await notify(env, `request:${revision}`, user.uid, 'request', 'Nova solicitação de acesso', `${user.name} (${user.email}) solicitou ${body.plan === 'studio' ? 'Studio' : 'Criador'}.`) }
  catch { /* The request is persisted; the admin list also shows all pending requests. */ }
  return json({ ok: true }, 201)
}

export async function reviewGrant(env: SaaSEnv, userId: string, revision: string): Promise<void> {
  const grant = await readGrant(env.DB!, userId)
  if (!grant || grant.revision !== revision || grant.status !== 'active') return
  const now = Date.now(), expires = Date.parse(grant.expires_at)
  const user = await env.DB!.prepare('SELECT COALESCE(auth_email,email) AS email,name FROM users WHERE id = ?').bind(userId).first<{ email: string; name: string }>()
  if (!user) return
  if (now >= expires - 3 * DAY) {
    const expired = now >= expires
    await notify(env, `grant:${revision}:${expired ? 'expired' : 'expiring'}`, userId, expired ? 'expired' : 'expiring',
      expired ? 'Acesso temporário encerrado' : 'Acesso temporário perto do fim',
      `${user.name} (${user.email}): ${grant.plan === 'studio' ? 'Studio' : 'Criador'} até ${grant.expires_at}. Revise no painel para prorrogar, encerrar ou indicar uma assinatura. Nenhuma cobrança foi iniciada.`)
    if (expired) {
      await env.DB!.prepare("UPDATE access_grants SET timer_status='complete' WHERE user_id=? AND revision=?").bind(userId, revision).run()
      return
    }
  }
  if (!env.BILLING_QUEUE) throw new Error('Fila de avisos não configurada.')
  const next = now < expires - 3 * DAY ? expires - 3 * DAY : expires
  await env.BILLING_QUEUE.send({ kind: 'access-review', userId, revision }, { delaySeconds: Math.max(1, Math.min(86400, Math.ceil((next - now) / 1000))) })
  await env.DB!.prepare("UPDATE access_grants SET timer_status='scheduled' WHERE user_id=? AND revision=?").bind(userId, revision).run()
}

export async function sendAdminEmail(env: SaaSEnv, id: string): Promise<void> {
  const row = await env.DB!.prepare('SELECT id,title,body,email_status,created_at FROM admin_notifications WHERE id=?').bind(id)
    .first<{ id: string; title: string; body: string; email_status: string; created_at: string }>()
  if (!row || row.email_status === 'sent') return
  if (!adminEmailConfigured(env)) {
    await env.DB!.prepare("UPDATE admin_notifications SET email_status='unconfigured' WHERE id=?").bind(id).run()
    return
  }
  // Resend deduplicates retries for 24 h; after that, require a manual retry with a new notification.
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `alvoprompter-admin/${id}` },
    body: JSON.stringify({ from: env.ADMIN_EMAIL_FROM, to: [env.ADMIN_NOTIFY_EMAIL], subject: `AlvoPrompter · ${row.title}`, text: `${row.body}\n\nAbra Conta e assinatura → Administração no AlvoPrompter.\n${env.APP_URL ?? ''}` }),
  })
  if (!response.ok) {
    await env.DB!.prepare("UPDATE admin_notifications SET email_status='failed' WHERE id=?").bind(id).run()
    throw new Error('Não foi possível enviar o aviso administrativo.')
  }
  await env.DB!.prepare("UPDATE admin_notifications SET email_status='sent',email_sent_at=? WHERE id=?").bind(new Date().toISOString(), id).run()
}

async function recoverNotices(env: SaaSEnv) {
  const due = await env.DB!.prepare("SELECT user_id,revision FROM access_grants WHERE status='active' AND (timer_status='pending' OR (timer_status<>'complete' AND expires_at <= ?)) LIMIT 50")
    .bind(new Date().toISOString()).all<{ user_id: string; revision: string }>()
  for (const grant of due.results) await reviewGrant(env, grant.user_id, grant.revision).catch(() => undefined)
  const pending = await env.DB!.prepare("SELECT id FROM admin_notifications WHERE email_status IN ('pending','unconfigured','failed') AND created_at > ? ORDER BY created_at DESC LIMIT 20")
    .bind(new Date(Date.now() - DAY).toISOString()).all<{ id: string }>()
  if (env.BILLING_QUEUE && adminEmailConfigured(env)) for (const row of pending.results) await env.BILLING_QUEUE.send({ kind: 'admin-email', notificationId: row.id }).catch(() => undefined)
}

export async function adminRoute(request: Request, env: SaaSEnv, actor: AuthUser): Promise<Response> {
  if (!isPlatformAdmin(env, actor)) return json({ error: 'Acesso restrito à administração do aplicativo.' }, 403)
  const db = env.DB!, url = new URL(request.url), path = url.pathname
  if (path === '/admin/app-policy') return adminAppPolicy(request, db, actor.uid)
  if (path === '/admin/overview' && request.method === 'GET') {
    await recoverNotices(env)
    const query = text(url.searchParams.get('q'), 100), cursor = text(url.searchParams.get('cursor'), 128)
    const rows = await db.prepare(`SELECT u.id,u.name,COALESCE(u.auth_email,u.email) AS email,u.updated_at AS lastSeenAt,r.plan AS requestedPlan,r.status AS requestStatus,
      g.plan AS grantPlan,g.status AS grantStatus,g.expires_at AS expiresAt,g.revision,g.timer_status AS timerStatus,
      s.plan AS paidPlan,s.provider,s.status AS paidStatus,s.current_period_end AS paidUntil
      FROM users u LEFT JOIN access_requests r ON r.user_id=u.id LEFT JOIN access_grants g ON g.user_id=u.id
      LEFT JOIN subscriptions s ON s.user_id=u.id WHERE (?='' OR instr(lower(COALESCE(u.auth_email,u.email) || ' ' || u.name),lower(?))>0) AND u.id>?
      ORDER BY u.id LIMIT 51`).bind(query, query, cursor).all()
    const notifications = await db.prepare('SELECT id,user_id AS userId,kind,title,body,created_at AS createdAt,read_at AS readAt,email_status AS emailStatus FROM admin_notifications ORDER BY created_at DESC LIMIT 50').all()
    const unread = await db.prepare('SELECT count(*) AS total FROM admin_notifications WHERE read_at IS NULL').first<{ total: number }>()
    const audit = await db.prepare('SELECT a.action,a.reason,a.created_at AS createdAt,COALESCE(u.auth_email,u.email) AS email FROM admin_audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 20').all()
    return json({ users: rows.results.slice(0, 50), nextCursor: rows.results.length > 50 ? (rows.results[49] as { id: string }).id : null, notifications: notifications.results,
      unread: unread?.total ?? 0, audit: audit.results, emailConfigured: adminEmailConfigured(env), timersConfigured: Boolean(env.BILLING_QUEUE) })
  }
  if (path === '/admin/billing-status' && request.method === 'GET') {
    const billing = billingAvailability(env)
    if (!billing.configured) return json({ configured: false, sandbox: billing.sandbox, providerStatus: null })
    // Read-only provider check. Never create a charge just to test credentials.
    const reply = await fetch(`${env.ASAAS_API_BASE?.replace(/\/$/, '') ?? 'https://api-sandbox.asaas.com/v3'}/myAccount/status`, {
      headers: asaasHeaders(env), signal: AbortSignal.timeout(10_000),
    })
    const body = await reply.json().catch(() => null) as { general?: unknown } | null
    const general = ['APPROVED','PENDING','AWAITING_ACTION','REJECTED'].includes(String(body?.general)) ? body!.general : null
    const pending = await db.prepare('SELECT count(*) AS total FROM pending_webhook_events').first<{ total: number }>()
    const errors = await db.prepare('SELECT count(*) AS total FROM checkout_intents WHERE upstream_status>=400').first<{ total: number }>()
    return json({ ...billing, credentialAccepted: reply.ok, providerHttpStatus: reply.status, providerStatus: general, pendingEvents: pending?.total ?? 0, failedCheckouts: errors?.total ?? 0 })
  }
  const read = path.match(/^\/admin\/notifications\/([^/]+)\/read$/)
  if (read && request.method === 'POST') {
    await db.prepare('UPDATE admin_notifications SET read_at=COALESCE(read_at,?) WHERE id=?').bind(new Date().toISOString(), decodeURIComponent(read[1])).run()
    return json({ ok: true })
  }
  if (path === '/admin/email-test' && request.method === 'POST') {
    if (!adminEmailConfigured(env)) return json({ error: 'Configure o envio de e-mail no servidor.' }, 503)
    await notify(env, `test:${crypto.randomUUID()}`, actor.uid, 'test', 'Teste de avisos administrativos', 'Os avisos de solicitações e vencimentos serão enviados a este endereço. Este teste não cria acesso nem cobrança.')
    return json({ ok: true })
  }
  const match = path.match(/^\/admin\/users\/([^/]+)\/access$/)
  if (!match || request.method !== 'POST') return json({ error: 'Rota não encontrada.' }, 404)
  const uid = decodeURIComponent(match[1]), target = await db.prepare('SELECT id FROM users WHERE id=?').bind(uid).first()
  if (!target) return json({ error: 'Usuário não encontrado. Ele precisa criar a conta primeiro.' }, 404)
  const body = await request.json().catch(() => null) as { action?: unknown; plan?: unknown; expiresAt?: unknown; reason?: unknown; expectedRevision?: unknown } | null
  const action = body?.action, reason = text(body?.reason, 500)
  if (!['grant','revoke','checkout','decline'].includes(String(action)) || reason.length < 3) return json({ error: 'Informe a ação e um motivo com pelo menos 3 caracteres.' }, 400)
  const before = await readGrant(db, uid)
  if ((before?.revision ?? null) !== (body?.expectedRevision ?? null)) return json({ error: 'Outro administrador alterou este acesso. Atualize e confira antes de salvar.' }, 409)
  if ((action === 'grant' || action === 'checkout') && !paidPlan(body?.plan)) return json({ error: 'Escolha Criador ou Studio.' }, 400)
  const expiry = typeof body?.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN
  if (action === 'grant' && (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 366 * DAY)) return json({ error: 'Escolha uma data futura de até 366 dias.' }, 400)
  const revision = crypto.randomUUID(), now = new Date().toISOString()
  const after = { plan: paidPlan(body?.plan) ? body.plan : before?.plan ?? 'creator', status: action === 'grant' ? 'active' : 'revoked',
    expiresAt: action === 'grant' ? new Date(expiry).toISOString() : before?.expires_at ?? now, revision }
  const commands: D1PreparedStatement[] = []
  commands.push(db.prepare(`INSERT INTO access_grants(user_id,plan,status,expires_at,revision,reason,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,expires_at=excluded.expires_at,revision=excluded.revision,
    reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at,timer_status='pending' WHERE access_grants.revision=?`)
    .bind(uid, after.plan, after.status, after.expiresAt, revision, reason, actor.uid, now, before?.revision ?? null))
  commands.push(db.prepare(`INSERT INTO admin_audit(id,actor_id,user_id,action,before_json,after_json,reason,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM access_grants WHERE user_id=? AND revision=?)`)
    .bind(crypto.randomUUID(), actor.uid, uid, action, JSON.stringify(before), JSON.stringify(after), reason, now, uid, revision))
  const requestStatus = action === 'grant' ? 'approved' : action === 'checkout' ? 'checkout_required' : 'declined'
  commands.push(db.prepare(`INSERT INTO access_requests(user_id,plan,status,revision,created_at,updated_at) SELECT ?,?,?,?,?,?
    WHERE EXISTS(SELECT 1 FROM access_grants WHERE user_id=? AND revision=?)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,revision=excluded.revision,updated_at=excluded.updated_at`)
    .bind(uid, after.plan, requestStatus, revision, now, now, uid, revision))
  const result = await db.batch(commands)
  if (!result[0]?.meta.changes) return json({ error: 'O acesso mudou. Atualize antes de salvar.' }, 409)
  let warning: string | null = null
  if (action === 'grant') {
    try { await reviewGrant(env, uid, revision) }
    catch { warning = 'Acesso salvo. O agendamento dos avisos está pendente; atualize o painel para tentar novamente.' }
  }
  return json({ ok: true, warning })
}
