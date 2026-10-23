import { useEffect, useRef, useState } from 'react'
import { accountFetch } from '../../lib/saas'
import { PLANS } from '../../lib/plans'
import AdminAppPolicy from './AdminAppPolicy'

interface AdminUser {
  id: string; name: string; email: string; lastSeenAt?: string; requestedPlan: 'creator' | 'studio' | null; requestStatus: string | null;
  grantPlan: 'creator' | 'studio' | null; grantStatus: string | null; expiresAt: string | null; revision: string | null; timerStatus: string | null;
  paidPlan: 'creator' | 'studio' | null; provider: string | null; paidStatus: string | null; paidUntil: string | null;
}
interface Overview {
  users: AdminUser[]; nextCursor: string | null; unread: number; emailConfigured: boolean; timersConfigured: boolean;
  notifications: { id: string; userId: string | null; title: string; body: string; kind: string; readAt: string | null; emailStatus: string; createdAt: string }[];
  audit: { action: string; reason: string; email: string; createdAt: string }[];
}
const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50'
const field = 'min-h-11 w-full rounded-xl border px-3 py-2 text-sm'
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—'
const localDate = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
const requestLabel: Record<string, string> = { pending: 'Aguardando liberação', approved: 'Acesso aprovado', declined: 'Solicitação encerrada', checkout_required: 'Aguardando assinatura' }

export default function AdminAccessPanel({ request = accountFetch }: { request?: typeof accountFetch }) {
  const editorRef = useRef<HTMLFormElement>(null)
  const [data, setData] = useState<Overview | null>(null)
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null), [plan, setPlan] = useState<'creator' | 'studio'>('creator')
  const [expires, setExpires] = useState(localDate(new Date(Date.now() + 30 * 86400000).toISOString())), [reason, setReason] = useState('')
  const [billingStatus, setBillingStatus] = useState<string | null>(null)
  const [action, setAction] = useState<'grant' | 'revoke' | 'checkout'>('grant'), [review, setReview] = useState(false)
  async function load(cursor = '') {
    const next = await request<Overview>(`/admin/overview?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`)
    setData(previous => cursor && previous ? { ...next, users: [...previous.users, ...next.users] } : next)
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await work() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { let active = true; request<Overview>('/admin/overview').then(next => { if (active) setData(next) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [request])
  useEffect(() => { if (selected) { editorRef.current?.focus(); editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } }, [selected])
  function choose(user: AdminUser) {
    setSelected(user); setPlan(user.requestedPlan ?? user.grantPlan ?? 'creator'); setReason(''); setAction('grant'); setReview(false)
    setExpires(localDate(user.expiresAt && Date.parse(user.expiresAt) > Date.now() ? user.expiresAt : new Date(Date.now() + 30 * 86400000).toISOString()))
  }
  async function save() {
    if (!selected) return
    const result = await request<{ warning: string | null }>(`/admin/users/${encodeURIComponent(selected.id)}/access`, { method: 'POST', body: JSON.stringify({ action, plan, expiresAt: action === 'grant' ? new Date(expires).toISOString() : undefined, reason, expectedRevision: selected.revision }) })
    setSelected(null); setReview(false); await load(); setMessage(result.warning ?? 'Alteração salva. Nenhuma cobrança foi criada ou modificada.')
  }
  return <section className="mt-6 space-y-5 rounded-2xl border p-4 sm:p-5" aria-label="Administração do aplicativo" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--brand-strong)' }}>Administração</p><h3 className="mt-1 text-xl font-bold">Acessos e vencimentos</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Libere Criador ou Studio por prazo. Você recebe avisos 3 dias antes e ao vencer. Depois, prorrogue, encerre ou indique a assinatura para o usuário confirmar.</p></div><button className={button} disabled={busy} onClick={() => void run(() => load())}>Atualizar painel</button></div>
    {message ? <p role="status" className="rounded-xl border p-3 text-sm">{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border p-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p> : null}
    {data ? <>
      <AdminAppPolicy request={request} />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"><span>{data.unread} aviso(s) não lido(s)</span><span>E-mail: {data.emailConfigured ? 'configurado' : 'configuração pendente'}</span><span>Agendamento: {data.timersConfigured ? 'ativo' : 'indisponível'}</span><button className={button} disabled={busy || !data.emailConfigured} onClick={() => void run(async () => { await request('/admin/email-test', { method: 'POST' }); setMessage('Teste agendado para o e-mail administrativo. Confira a entrega.'); await load() })}>Testar meu e-mail</button></div>
      <div className="space-y-2"><button className={button} disabled={busy} onClick={() => void run(async () => { const result = await request<{ credentialAccepted?: boolean; providerStatus?: string; providerHttpStatus?: number; configured: boolean; sandbox: boolean; pendingEvents?: number; failedCheckouts?: number }>('/admin/billing-status'); setBillingStatus(!result.configured ? 'Cobrança não configurada.' : `${result.sandbox ? 'Sandbox' : 'Produção'} · ${result.credentialAccepted ? 'Credencial aceita pelo Asaas' : `Verificação recusada (HTTP ${result.providerHttpStatus})`} · Conta: ${result.providerStatus ?? 'não informado'} · Eventos sem conciliação: ${result.pendingEvents ?? 0} · Falhas de checkout: ${result.failedCheckouts ?? 0}. Esta consulta não cria cobrança.`) })}>Verificar conexão Asaas sem cobrar</button>{billingStatus ? <p role="status" className="text-sm leading-relaxed">{billingStatus}</p> : null}</div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void run(() => load()) }}><label className="min-w-0 flex-1 text-sm font-semibold">Buscar pessoa por nome ou e-mail<input className={`${field} mt-1`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou e-mail cadastrado" /></label><button className={button} disabled={busy}>Buscar usuários</button></form>
      <div className="grid gap-3 sm:grid-cols-2">{data.users.map(user => {
        const active = user.grantStatus === 'active' && Date.parse(user.expiresAt ?? '') > Date.now()
        return <article key={user.id} className="min-w-0 space-y-2 rounded-xl border p-4" style={{ background: 'var(--panel)' }}><h4 className="break-words font-bold">{user.name}</h4><p className="break-all text-sm" style={{ color: 'var(--ink-soft)' }}>{user.email}</p><p className="break-all text-xs" style={{ color: 'var(--ink-soft)' }}>Conta: {user.id}<br />Última atividade: {date(user.lastSeenAt ?? null)}</p><p className="text-sm">{user.requestStatus ? requestLabel[user.requestStatus] ?? user.requestStatus : 'Sem solicitação'}{user.requestedPlan ? ` · ${PLANS[user.requestedPlan].name}` : ''}</p><p className="text-sm">{user.grantPlan ? `${PLANS[user.grantPlan].name} temporário: ${active ? 'ativo' : user.grantStatus === 'revoked' ? 'encerrado' : 'expirado'} · ${date(user.expiresAt)}` : 'Sem liberação temporária'}</p>{user.timerStatus === 'pending' && active ? <p className="text-sm" style={{ color: 'var(--danger)' }}>Agendamento pendente. Atualize o painel.</p> : null}<p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Assinatura: {user.paidPlan ? `${PLANS[user.paidPlan].name} · ${user.provider} · ${user.paidStatus} · até ${date(user.paidUntil)}` : 'nenhuma'}</p><button className={`${button} w-full`} disabled={busy} onClick={() => choose(user)}>Gerenciar acesso de {user.name}</button></article>
      })}</div>
      {!data.users.length ? <p className="text-sm">Nenhum usuário encontrado. A pessoa precisa criar sua conta primeiro.</p> : null}
      {data.nextCursor ? <button className={button} disabled={busy} onClick={() => void run(() => load(data.nextCursor!))}>Carregar mais usuários</button> : null}
      {selected ? <form ref={editorRef} tabIndex={-1} className="space-y-4 rounded-2xl border p-4" aria-label="Alterar acesso temporário" onSubmit={e => { e.preventDefault(); if (review) void run(save); else setReview(true) }}>
        <h4 className="break-words font-bold">Gerenciar: {selected.name}</h4><p className="break-all text-sm">{selected.email}</p>
        <label className="block text-sm font-semibold">O que fazer<select className={`${field} mt-1`} disabled={review || busy} value={action} onChange={e => setAction(e.target.value as typeof action)}><option value="grant">Liberar ou prorrogar cortesia</option><option value="revoke">Encerrar cortesia</option><option value="checkout">Indicar assinatura</option></select></label>
        {action !== 'revoke' ? <label className="block text-sm font-semibold">Plano<select className={`${field} mt-1`} disabled={review || busy} value={plan} onChange={e => setPlan(e.target.value as typeof plan)}><option value="creator">Criador</option><option value="studio">Studio</option></select></label> : null}
        {action === 'grant' ? <label className="block text-sm font-semibold">Acesso válido até (horário deste aparelho)<input required type="datetime-local" className={`${field} mt-1`} disabled={review || busy} value={expires} min={localDate(new Date().toISOString())} max={localDate(new Date(Date.now() + 365 * 86400000).toISOString())} onChange={e => setExpires(e.target.value)} /></label> : null}
        <label className="block text-sm font-semibold">Motivo para o histórico<textarea className={`${field} mt-1`} required minLength={3} maxLength={500} rows={2} disabled={review || busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{action === 'grant' ? 'O acesso expira automaticamente. A renovação precisa de uma nova decisão sua. Uma assinatura já paga continua válida.' : action === 'checkout' ? 'A cortesia termina agora. O usuário verá o plano indicado e precisará confirmar a assinatura. Esta ação não debita cartão nem muda contratos existentes.' : 'O benefício temporário termina agora. O usuário mantém o plano gratuito ou a assinatura válida que já possui.'}</p>
        {review ? <p role="status" className="rounded-xl border p-3 text-sm font-semibold">Confirme: {selected.email} · {action === 'grant' ? `${PLANS[plan].name} até ${date(new Date(expires).toISOString())}` : action === 'checkout' ? `indicar ${PLANS[plan].name} para assinatura` : 'encerrar cortesia'}. Sem cobrança automática.</p> : null}
        <div className="flex flex-wrap gap-2"><button className={button} style={{ background: 'var(--brand-gradient)', color: 'white' }} disabled={busy}>{review ? 'Confirmar alteração' : 'Revisar alteração'}</button>{review ? <button type="button" className={button} disabled={busy} onClick={() => setReview(false)}>Voltar e ajustar</button> : null}<button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>Cancelar edição</button></div>
      </form> : null}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Central de avisos ({data.notifications.length})</summary><div className="mt-3 space-y-3">{data.notifications.map(n => <article className="space-y-2 rounded-xl border p-3" key={n.id}><h4 className="font-bold">{n.title}{!n.readAt ? ' · Novo' : ''}</h4><p className="break-words text-sm leading-relaxed">{n.body}</p><p className="text-xs">{date(n.createdAt)} · E-mail: {({ sent: 'enviado ao provedor', pending: 'na fila', failed: 'falhou; verificar envio', unconfigured: 'serviço não configurado' } as Record<string, string>)[n.emailStatus] ?? n.emailStatus}</p><div className="flex flex-wrap gap-2">{n.userId ? <button className={button} disabled={busy} onClick={() => void run(async () => { const next = await request<Overview>(`/admin/overview?q=${encodeURIComponent(n.body.match(/\(([^)]+@[^)]+)\)/)?.[1] ?? '')}`); setData(next); const person = next.users.find(u => u.id === n.userId); if (person) choose(person) })}>Revisar usuário</button> : null}{!n.readAt ? <button className={button} disabled={busy} onClick={() => void run(async () => { await request(`/admin/notifications/${encodeURIComponent(n.id)}/read`, { method: 'POST' }); await load() })}>Marcar como lido</button> : null}</div></article>)}</div></details>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Histórico de alterações</summary><ul className="mt-3 space-y-3">{data.audit.map((item, i) => <li className="break-words text-sm" key={`${item.createdAt}-${i}`}><strong>{item.email}</strong> · {({ grant: 'Liberação ou prorrogação', revoke: 'Encerramento', checkout: 'Assinatura indicada', decline: 'Solicitação encerrada' } as Record<string, string>)[item.action] ?? item.action}<br />{item.reason}<br /><span style={{ color: 'var(--ink-soft)' }}>{date(item.createdAt)}</span></li>)}</ul></details>
    </> : !error ? <p role="status">Carregando administração…</p> : null}
  </section>
}
