import { workspaceContent } from './content'
import { decodeProtectedHeader, importX509, jwtVerify } from 'jose'

export type SaaSPlan = 'free' | 'creator' | 'studio'
type SaaSRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface SaaSEnv {
  DB?: D1Database
  FIREBASE_PROJECT_ID?: string
  ASAAS_API_KEY?: string
  ASAAS_API_BASE?: string
  ASAAS_WEBHOOK_TOKEN?: string
  APP_URL?: string
}

interface AuthUser {
  uid: string
  email: string
  name: string
  emailVerified: boolean
}

interface SubscriptionRow {
  plan: SaaSPlan
  status: 'pending' | 'active' | 'past_due' | 'canceled'
  current_period_end: string | null
}

const PLAN_CONFIG = {
  free: { price: 0, workspaces: 0, members: 1, aiActionsMonthly: 10 },
  creator: { price: 29.9, workspaces: 1, members: 1, aiActionsMonthly: 100 },
  studio: { price: 79.9, workspaces: 5, members: 5, aiActionsMonthly: 300 },
} as const

const firebaseKeys = new Map<string, CryptoKey>()

function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function requireDb(env: SaaSEnv): D1Database {
  if (!env.DB) throw new Error('Banco SaaS não configurado.')
  return env.DB
}

async function firebasePublicKey(kid: string): Promise<CryptoKey> {
  const cached = firebaseKeys.get(kid)
  if (cached) return cached
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com')
  if (!response.ok) throw new Error('Não foi possível validar a sessão.')
  const certificates = (await response.json()) as Record<string, string>
  const certificate = certificates[kid]
  if (!certificate) throw new Error('Sessão inválida.')
  const key = await importX509(certificate, 'RS256')
  firebaseKeys.set(kid, key)
  return key
}

async function authenticate(request: Request, env: SaaSEnv): Promise<AuthUser> {
  const projectId = env.FIREBASE_PROJECT_ID?.trim()
  if (!projectId) throw new Error('Login não configurado no servidor.')
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) throw new Error('Entre na sua conta para continuar.')
  const header = decodeProtectedHeader(token)
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Sessão inválida.')
  const key = await firebasePublicKey(header.kid)
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  })
  if (!payload.sub || typeof payload.email !== 'string') throw new Error('Sessão sem identidade válida.')
  return {
    uid: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' ? payload.name : payload.email.split('@')[0]!,
    emailVerified: payload.email_verified === true,
  }
}

async function syncUser(db: D1Database, user: AuthUser): Promise<void> {
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO users (id, email, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = excluded.updated_at
  `).bind(user.uid, user.email, user.name, now, now).run()
  if (user.emailVerified) await db.prepare(`
    UPDATE workspace_members SET user_id = ?, accepted_at = ?, invited_name = COALESCE(invited_name, ?)
    WHERE user_id IS NULL AND lower(invited_email) = lower(?)
  `).bind(user.uid, now, user.name, user.email).run()
}

async function effectivePlan(db: D1Database, uid: string): Promise<{ plan: SaaSPlan; subscription: SubscriptionRow | null }> {
  const subscription = await db.prepare(`
    SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ? LIMIT 1
  `).bind(uid).first<SubscriptionRow>()
  const paidThroughPeriod = subscription?.status === 'canceled' && Boolean(subscription.current_period_end) && Date.parse(subscription.current_period_end!) > Date.now()
  const active = subscription?.status === 'active' && (!subscription.current_period_end || Date.parse(subscription.current_period_end) > Date.now())
  return { plan: active || paidThroughPeriod ? subscription!.plan : 'free', subscription: subscription ?? null }
}

async function accountSummary(db: D1Database, user: AuthUser): Promise<Response> {
  const { plan, subscription } = await effectivePlan(db, user.uid)
  const usage = await db.prepare('SELECT ai_actions FROM usage_monthly WHERE user_id = ? AND month = ? LIMIT 1')
    .bind(user.uid, new Date().toISOString().slice(0, 7)).first<{ ai_actions: number }>()
  const rows = await db.prepare(`
    SELECT w.id, w.name, wm.role, w.created_at AS createdAt
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY w.created_at DESC
  `).bind(user.uid).all<{ id: string; name: string; role: SaaSRole; createdAt: string }>()
  return responseJson({
    user: { uid: user.uid, email: user.email, name: user.name },
    subscription: {
      plan,
      status: subscription?.status ?? 'free',
      currentPeriodEnd: subscription?.current_period_end ?? null,
    },
    limits: {
      workspaces: PLAN_CONFIG[plan].workspaces,
      members: PLAN_CONFIG[plan].members,
      aiActionsMonthly: PLAN_CONFIG[plan].aiActionsMonthly,
    },
    usage: { aiActions: usage?.ai_actions ?? 0 },
    workspaces: rows.results,
  })
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validRole(value: unknown): value is Exclude<SaaSRole, 'owner'> {
  return value === 'admin' || value === 'editor' || value === 'viewer'
}

async function membership(db: D1Database, workspaceId: string, uid: string): Promise<{ role: SaaSRole } | null> {
  return db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1')
    .bind(workspaceId, uid).first<{ role: SaaSRole }>()
}

async function createWorkspace(request: Request, db: D1Database, user: AuthUser): Promise<Response> {
  const { plan } = await effectivePlan(db, user.uid)
  const allowed = PLAN_CONFIG[plan].workspaces
  if (allowed === 0) return responseJson({ error: 'Workspaces em nuvem estão disponíveis nos planos Criador e Studio.' }, 403)
  const count = await db.prepare(`
    SELECT COUNT(*) AS total FROM workspace_members WHERE user_id = ? AND role = 'owner'
  `).bind(user.uid).first<{ total: number }>()
  if ((count?.total ?? 0) >= allowed) return responseJson({ error: `Seu plano permite até ${allowed} workspace(s).` }, 403)
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null
  const name = cleanText(body?.name, 80)
  if (name.length < 2) return responseJson({ error: 'Informe um nome com pelo menos 2 caracteres.' }, 400)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const created = await db.batch([
    db.prepare(`INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) SELECT ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM workspaces WHERE owner_id = ?) < ?`).bind(id, name, user.uid, now, now, user.uid, allowed),
    db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, invited_email, invited_name, role, accepted_at, created_at)
      SELECT ?, ?, ?, ?, ?, 'owner', ?, ? WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = ?)`)
      .bind(crypto.randomUUID(), id, user.uid, user.email, user.name, now, now, id),
  ])
  if (!created[0]?.meta.changes) return responseJson({ error: `Seu plano permite até ${allowed} workspace(s).` }, 403)
  return responseJson({ workspace: { id, name, role: 'owner', createdAt: now } }, 201)
}

async function inviteMember(request: Request, db: D1Database, user: AuthUser, workspaceId: string): Promise<Response> {
  const actor = await membership(db, workspaceId, user.uid)
  if (!actor || !['owner', 'admin'].includes(actor.role)) return responseJson({ error: 'Você não pode gerenciar membros deste workspace.' }, 403)
  const workspace = await db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').bind(workspaceId).first<{ owner_id: string }>()
  if (!workspace) return responseJson({ error: 'Workspace não encontrado.' }, 404)
  const { plan } = await effectivePlan(db, workspace.owner_id)
  if (plan !== 'studio') return responseJson({ error: 'Colaboração com RBAC está disponível no plano Studio.' }, 403)
  const count = await db.prepare('SELECT COUNT(*) AS total FROM workspace_members WHERE workspace_id = ?').bind(workspaceId).first<{ total: number }>()
  const body = (await request.json().catch(() => null)) as { email?: unknown; name?: unknown; role?: unknown } | null
  const email = cleanText(body?.email, 190).toLowerCase()
  const name = cleanText(body?.name, 80)
  const role = body?.role
  if (!/^\S+@\S+\.\S+$/.test(email) || !validRole(role)) return responseJson({ error: 'Informe e-mail e papel válidos.' }, 400)
  if (role === 'admin' && actor.role !== 'owner') return responseJson({ error: 'Somente o proprietário pode nomear administradores.' }, 403)
  const now = new Date().toISOString()
  const existingMember = await db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND invited_email = ? COLLATE NOCASE').bind(workspaceId, email).first<{ role: SaaSRole }>()
  if (existingMember?.role === 'owner' || (existingMember?.role === 'admin' && actor.role !== 'owner')) return responseJson({ error: 'Você não pode alterar este membro.' }, 403)
  if (!existingMember && (count?.total ?? 0) >= PLAN_CONFIG.studio.members) return responseJson({ error: 'O Studio permite até 5 membros.' }, 403)
  const invited = await db.prepare(`
    INSERT INTO workspace_members (id, workspace_id, user_id, invited_email, invited_name, role, accepted_at, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?) < ?
      OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = ? AND invited_email = ?)
    ON CONFLICT(workspace_id, invited_email) DO UPDATE SET role = excluded.role, invited_name = excluded.invited_name
  `).bind(crypto.randomUUID(), workspaceId, null, email, name || email.split('@')[0], role, null, now, workspaceId, PLAN_CONFIG.studio.members, workspaceId, email).run()
  if (!invited.meta.changes) return responseJson({ error: 'O Studio permite até 5 membros.' }, 403)
  return responseJson({ ok: true }, 201)
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

async function createCheckout(request: Request, env: SaaSEnv, db: D1Database, user: AuthUser): Promise<Response> {
  if (!user.emailVerified) return responseJson({ error: 'Confirme seu e-mail antes de assinar.' }, 403)
  if (!env.ASAAS_API_KEY) return responseJson({ error: 'Checkout ainda não configurado neste ambiente.' }, 503)
  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null
  const plan = body?.plan
  if (plan !== 'creator' && plan !== 'studio') return responseJson({ error: 'Plano inválido.' }, 400)
  const current = await effectivePlan(db, user.uid)
  if (current.plan === plan) return responseJson({ error: 'Este já é o seu plano atual.' }, 409)
  const checkoutId = `alp_${crypto.randomUUID()}`
  const appUrl = (env.APP_URL ?? '').replace(/\/$/, '')
  if (!appUrl.startsWith('https://') && !appUrl.startsWith('http://localhost')) {
    return responseJson({ error: 'URL pública do aplicativo ainda não configurada.' }, 503)
  }
  const today = new Date().toISOString().slice(0, 10)
  const payload = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: 60,
    externalReference: checkoutId,
    callback: {
      successUrl: `${appUrl}/?billing=success`,
      cancelUrl: `${appUrl}/?billing=cancel`,
      expiredUrl: `${appUrl}/?billing=expired`,
    },
    items: [{
      externalReference: `plan_${plan}`,
      name: `AlvoPrompter ${plan === 'creator' ? 'Criador' : 'Studio'}`,
      description: 'Assinatura mensal do AlvoPrompter',
      quantity: 1,
      value: PLAN_CONFIG[plan].price,
    }],
    customerData: { name: user.name, email: user.email },
    subscription: { cycle: 'MONTHLY', nextDueDate: today },
  }
  const base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  const upstream = await fetch(`${base}/checkouts`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', access_token: env.ASAAS_API_KEY },
    body: JSON.stringify(payload),
  })
  const result = (await upstream.json().catch(() => null)) as { id?: string; link?: string; errors?: unknown } | null
  if (!upstream.ok || !result?.id || !result.link) return responseJson({ error: 'O Asaas não conseguiu abrir o checkout. Confira a configuração e tente novamente.' }, 502)
  await db.prepare(`
    INSERT INTO checkout_sessions (id, user_id, plan, asaas_checkout_id, checkout_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(checkoutId, user.uid, plan, result.id, result.link, new Date().toISOString(), new Date().toISOString()).run()
  return responseJson({ url: result.link })
}

async function cancelSubscription(request: Request, env: SaaSEnv, db: D1Database, user: AuthUser): Promise<Response> {
  if (!env.ASAAS_API_KEY) return responseJson({ error: 'Cobrança ainda não configurada neste ambiente.' }, 503)
  const subscription = await db.prepare(`
    SELECT asaas_subscription_id, current_period_end FROM subscriptions
    WHERE user_id = ? AND status IN ('active', 'past_due') LIMIT 1
  `).bind(user.uid).first<{ asaas_subscription_id: string | null; current_period_end: string | null }>()
  if (!subscription?.asaas_subscription_id) return responseJson({ error: 'Assinatura ativa não localizada no Asaas.' }, 404)
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null
  const reason = cleanText(body?.reason, 200) || 'Cancelamento solicitado pelo titular no aplicativo.'
  const base = env.ASAAS_API_BASE?.replace(/\/$/, '') || 'https://api-sandbox.asaas.com/v3'
  const upstream = await fetch(`${base}/subscriptions/${encodeURIComponent(subscription.asaas_subscription_id)}`, {
    method: 'DELETE',
    headers: { accept: 'application/json', access_token: env.ASAAS_API_KEY },
  })
  if (!upstream.ok) return responseJson({ error: 'Não foi possível cancelar a renovação no Asaas. Tente novamente.' }, 502)
  const periodEnd = subscription.current_period_end ?? plusDays(32)
  await db.prepare(`UPDATE subscriptions SET status = 'canceled', cancellation_reason = ?, current_period_end = ?, updated_at = ? WHERE user_id = ?`)
    .bind(reason, periodEnd, new Date().toISOString(), user.uid).run()
  return responseJson({ ok: true, accessUntil: periodEnd })
}

function safeTokenEqual(received: string, expected: string): boolean {
  if (received.length !== expected.length || !received.length) return false
  let difference = 0
  for (let index = 0; index < received.length; index++) difference |= received.charCodeAt(index) ^ expected.charCodeAt(index)
  return difference === 0
}

async function handleWebhook(request: Request, env: SaaSEnv, db: D1Database): Promise<Response> {
  const expected = env.ASAAS_WEBHOOK_TOKEN ?? ''
  const received = request.headers.get('asaas-access-token') ?? ''
  if (!expected || !safeTokenEqual(received, expected)) return responseJson({ error: 'Webhook não autorizado.' }, 401)
  const event = (await request.json().catch(() => null)) as {
    id?: string
    event?: string
    checkout?: { id?: string; customer?: string; subscription?: { id?: string } }
    subscription?: { id?: string; externalReference?: string; customer?: string; status?: string }
    payment?: { subscription?: string; checkoutSession?: string; customer?: string }
  } | null
  if (!event?.id || !event.event) return responseJson({ error: 'Evento inválido.' }, 400)
  const processed = () => db.prepare('SELECT id FROM webhook_events WHERE id = ?').bind(event.id).first()
  if (await processed()) return responseJson({ ok: true, duplicate: true })
  const statements: D1PreparedStatement[] = []

  const now = new Date().toISOString()
  const checkoutAsaasId = event.checkout?.id ?? event.payment?.checkoutSession
  if (event.event === 'CHECKOUT_PAID' && checkoutAsaasId) {
    const checkout = await db.prepare('SELECT id, user_id, plan FROM checkout_sessions WHERE asaas_checkout_id = ? LIMIT 1')
      .bind(checkoutAsaasId).first<{ id: string; user_id: string; plan: SaaSPlan }>()
    if (!checkout) return responseJson({ error: 'Checkout ainda não encontrado. Reenvie o evento.' }, 503)
    if (checkout) {
      const subscriptionId = event.checkout?.subscription?.id ?? null
      statements.push(
        db.prepare(`UPDATE checkout_sessions SET status = 'paid', asaas_customer_id = ?, updated_at = ? WHERE id = ?`)
          .bind(event.checkout?.customer ?? null, now, checkout.id),
        db.prepare(`
          INSERT INTO subscriptions (id, user_id, plan, status, asaas_subscription_id, asaas_customer_id, current_period_end, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
            asaas_subscription_id = COALESCE(excluded.asaas_subscription_id, subscriptions.asaas_subscription_id),
            asaas_customer_id = COALESCE(excluded.asaas_customer_id, subscriptions.asaas_customer_id),
            current_period_end = excluded.current_period_end, updated_at = excluded.updated_at
        `).bind(crypto.randomUUID(), checkout.user_id, checkout.plan, subscriptionId, event.checkout?.customer ?? null, plusDays(32), now, now),
      )
    }
  }

  if ((event.event === 'CHECKOUT_CANCELED' || event.event === 'CHECKOUT_EXPIRED') && checkoutAsaasId) {
    statements.push(db.prepare("UPDATE checkout_sessions SET status = ?, updated_at = ? WHERE asaas_checkout_id = ? AND status <> 'paid'")
      .bind(event.event === 'CHECKOUT_CANCELED' ? 'canceled' : 'expired', now, checkoutAsaasId))
  }

  const subscriptionId = event.subscription?.id ?? event.payment?.subscription
  if (event.event === 'SUBSCRIPTION_CREATED' && event.subscription?.id) {
    const externalReference = event.subscription.externalReference
    const checkout = externalReference
      ? await db.prepare('SELECT user_id, plan FROM checkout_sessions WHERE id = ? LIMIT 1').bind(externalReference).first<{ user_id: string; plan: SaaSPlan }>()
      : event.subscription.customer
        ? await db.prepare(`SELECT user_id, plan FROM checkout_sessions WHERE asaas_customer_id = ? AND status = 'paid' ORDER BY updated_at DESC LIMIT 1`).bind(event.subscription.customer).first<{ user_id: string; plan: SaaSPlan }>()
        : null
    if (!checkout) return responseJson({ error: 'Checkout ainda não encontrado. Reenvie o evento.' }, 503)
    const activeSubscription = await db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').bind(checkout.user_id).first()
    if (!activeSubscription) return responseJson({ error: 'Pagamento ainda não processado. Reenvie o evento.' }, 503)
    statements.push(db.prepare(`UPDATE subscriptions SET asaas_subscription_id = ?, asaas_customer_id = ?, updated_at = ? WHERE user_id = ?`)
      .bind(event.subscription.id, event.subscription.customer ?? null, now, checkout.user_id))
  }

  if (subscriptionId && /^(PAYMENT_|SUBSCRIPTION_(INACTIVATED|DELETED))/.test(event.event)) {
    const linked = await db.prepare('SELECT id FROM subscriptions WHERE asaas_subscription_id = ?').bind(subscriptionId).first()
    if (!linked) return responseJson({ error: 'Assinatura ainda não vinculada. Reenvie o evento.' }, 503)
  }

  if (subscriptionId && ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event.event)) {
    statements.push(db.prepare(`UPDATE subscriptions SET status = 'active', current_period_end = ?, updated_at = ? WHERE asaas_subscription_id = ?`)
      .bind(plusDays(32), now, subscriptionId))
  }
  if (subscriptionId && ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(event.event)) {
    statements.push(db.prepare(`UPDATE subscriptions SET status = 'past_due', updated_at = ? WHERE asaas_subscription_id = ?`)
      .bind(now, subscriptionId))
  }
  if (event.subscription?.id && ['SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED'].includes(event.event)) {
    statements.push(db.prepare(`UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE asaas_subscription_id = ?`)
      .bind(now, event.subscription.id))
  }
  // D1 batch is one transaction: a failed effect also rolls back the event ID.
  // A competing delivery fails the unique INSERT and rolls back all its effects.
  try {
    await db.batch([
      db.prepare('INSERT INTO webhook_events (id, event_type, received_at) VALUES (?, ?, ?)').bind(event.id, event.event, now),
      ...statements,
    ])
  } catch (error) {
    if (await processed()) return responseJson({ ok: true, duplicate: true })
    throw error
  }
  return responseJson({ ok: true })
}

export async function handleSaaSRequest(request: Request, env: SaaSEnv): Promise<Response | null> {
  const url = new URL(request.url)
  const isSaaSPath = url.pathname === '/account' || url.pathname.startsWith('/account/') || url.pathname.startsWith('/billing/') || url.pathname === '/webhooks/asaas'
  if (!isSaaSPath) return null
  try {
    const db = requireDb(env)
    if (url.pathname === '/webhooks/asaas' && request.method === 'POST') return await handleWebhook(request, env, db)
    const user = await authenticate(request, env)
    await syncUser(db, user)
    const contentMatch = url.pathname.match(/^\/account\/workspaces\/([a-f0-9-]+)\/content\/(scripts|schedules|brandkit)$/i)
    if (contentMatch) {
      const workspaceId = contentMatch[1]!
      const actor = await membership(db, workspaceId, user.uid)
      if (!actor) return responseJson({ error: 'Você não pertence a este workspace.' }, 403)
      const workspace = await db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').bind(workspaceId).first<{ owner_id: string }>()
      if (!workspace) return responseJson({ error: 'Workspace não encontrado.' }, 404)
      const ownerPlan = await effectivePlan(db, workspace.owner_id)
      if (ownerPlan.plan === 'free' || (actor.role !== 'owner' && ownerPlan.plan !== 'studio')) return responseJson({ error: 'O proprietário precisa de um plano ativo para sincronizar este workspace.' }, 403)
      if (contentMatch[2] === 'brandkit' && request.method === 'PUT' && ownerPlan.plan !== 'studio') return responseJson({ error: 'A identidade visual compartilhada está disponível no Studio.' }, 403)
      return await workspaceContent(request, db, workspaceId, contentMatch[2]!, user.uid, actor.role)
    }
    if (url.pathname === '/account' && request.method === 'GET') return await accountSummary(db, user)
    if (url.pathname === '/account/workspaces' && request.method === 'POST') return await createWorkspace(request, db, user)
    const memberMatch = url.pathname.match(/^\/account\/workspaces\/([a-f0-9-]+)\/members$/i)
    if (memberMatch && request.method === 'GET') {
      const actor = await membership(db, memberMatch[1]!, user.uid)
      if (!actor) return responseJson({ error: 'Você não pertence a este workspace.' }, 403)
      const rows = await db.prepare('SELECT id, invited_name AS name, invited_email AS email, role, accepted_at AS acceptedAt FROM workspace_members WHERE workspace_id = ?').bind(memberMatch[1]).all()
      return responseJson({ members: rows.results })
    }
    if (memberMatch && request.method === 'POST') return await inviteMember(request, db, user, memberMatch[1]!)
    if (url.pathname === '/billing/checkout' && request.method === 'POST') return await createCheckout(request, env, db, user)
    if (url.pathname === '/billing/subscription' && request.method === 'DELETE') return await cancelSubscription(request, env, db, user)
    return responseJson({ error: 'Rota não encontrada.' }, 404)
  } catch (error) {
    const message = (error as Error).message
    const authError = /sessão|conta|login|token/i.test(message)
    return responseJson({ error: message }, authError ? 401 : 503)
  }
}

export async function requireUser(
  request: Request,
  env: SaaSEnv,
): Promise<AuthUser> {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? ''
  if (!env.DB || !projectId || projectId.startsWith('configure-')) {
    throw new Error('Login não configurado no servidor.')
  }
  const user = await authenticate(request, env)
  await syncUser(requireDb(env), user)
  return user
}

/**
 * Consome uma ação mensal de IA quando o SaaS está configurado.
 * Retorna Response quando a chamada deve parar; registra a reserva para reembolso em falha.
 */
export interface AiCharge { uid: string; month: string }

export async function authorizeAiAction(request: Request, env: SaaSEnv, onCharge?: (charge: AiCharge) => void): Promise<Response | null> {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? ''
  if (!env.DB || !projectId || projectId.startsWith('configure-')) return responseJson({ error: 'O acesso à IA ainda não foi configurado neste ambiente.' }, 503)
  try {
    const user = await authenticate(request, env)
    const db = requireDb(env)
    await syncUser(db, user)
    const { plan } = await effectivePlan(db, user.uid)
    const limit = PLAN_CONFIG[plan].aiActionsMonthly
    const month = new Date().toISOString().slice(0, 7)
    const result = await db.prepare(`
      INSERT INTO usage_monthly (user_id, month, ai_actions, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, month) DO UPDATE SET ai_actions = ai_actions + 1, updated_at = excluded.updated_at
      WHERE usage_monthly.ai_actions < ?
    `).bind(user.uid, month, new Date().toISOString(), limit).run()
    if ((result.meta.changes ?? 0) === 0) {
      return responseJson({ error: `Você atingiu os ${limit} usos de IA do plano ${plan}.` }, 429)
    }
    onCharge?.({ uid: user.uid, month })
    return null
  } catch (error) {
    const message = (error as Error).message
    return responseJson({ error: message }, /sessão|conta|login|token/i.test(message) ? 401 : 503)
  }
}

export async function refundAiAction(charge: AiCharge, env: SaaSEnv): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare(`UPDATE usage_monthly SET ai_actions = MAX(ai_actions - 1, 0), updated_at = ? WHERE user_id = ? AND month = ?`)
    .bind(new Date().toISOString(), charge.uid, charge.month).run()
}
