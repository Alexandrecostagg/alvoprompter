import { useEffect, useMemo, useState } from 'react'
import { firebaseConfigured, observeUser, resendVerification, refreshVerifiedUser, resetPassword, signIn, signUp, signUserOut, type User } from '../../lib/auth'
import { formatPlanPrice, PAID_PLAN_IDS, PLANS, type PlanId } from '../../lib/plans'
import { cancelSubscription, loadAccount, startCheckout, type AccountSummary } from '../../lib/saas'
import { useAppStore } from '../../store/useAppStore'
import { trackMetaStandard } from '../../lib/metaPixel'

type AuthMode = 'signin' | 'signup'

function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string }).code ?? ''
  if (code.includes('invalid-credential')) return 'E-mail ou senha inválidos.'
  if (code.includes('email-already-in-use')) return 'Não foi possível criar a conta com esses dados.'
  if (code.includes('weak-password')) return 'Use uma senha mais forte, com pelo menos 8 caracteres.'
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  return (error as Error).message || 'Não foi possível concluir. Tente novamente.'
}

function PlanCard({ planId, currentPlan, busy, onChoose }: { planId: PlanId; currentPlan: PlanId; busy: boolean; onChoose: (plan: PlanId) => void }) {
  const plan = PLANS[planId]
  const current = currentPlan === planId
  return (
    <article className="relative flex h-full flex-col rounded-3xl border p-5" style={{ borderColor: plan.badge ? 'var(--accent)' : 'var(--border)', background: plan.badge ? 'var(--accent-soft)' : 'var(--bg)' }}>
      {plan.badge ? <span className="mb-3 w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--brand-gradient)', color: 'white' }}>{plan.badge}</span> : null}
      <h3 className="text-lg font-bold">{plan.name}</h3>
      {plan.priceMonthly > 0 ? <p className="mt-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted)' }}>Preço de lançamento</p> : null}
      <p className={plan.priceMonthly > 0 ? 'mt-1 text-3xl font-extrabold' : 'mt-2 text-3xl font-extrabold'}>{formatPlanPrice(plan.priceMonthly)}{plan.priceMonthly > 0 ? <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>/mês</span> : null}</p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{plan.description}</p>
      <ul className="my-5 space-y-2 text-sm">
        {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span style={{ color: 'var(--ok)' }}>✓</span><span>{feature}</span></li>)}
      </ul>
      <button disabled={busy || current || planId === 'free'} onClick={() => onChoose(planId)} className="mt-auto min-h-11 rounded-2xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: planId === 'free' ? 'var(--panel)' : 'var(--brand-gradient)', color: planId === 'free' ? 'var(--muted)' : 'white' }}>
        {current ? 'Plano atual' : planId === 'free' ? 'Incluído' : `Assinar ${plan.name}`}
      </button>
    </article>
  )
}

export default function AccountPanel({ open, initialPlan, onClose }: { open: boolean; initialPlan?: PlanId | null; onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const requestedPlan = useMemo(() => initialPlan && initialPlan !== 'free' ? initialPlan : null, [initialPlan])

  useEffect(() => observeUser((next) => {
    setUser(next)
    setAuthReady(true)
    if (next) setEmail(next.email ?? '')
    else setAccount(null)
  }), [])

  useEffect(() => {
    if (!open || !user) return
    setBusy(true)
    loadAccount()
      .then(setAccount)
      .catch((error) => setMessage({ kind: 'error', text: (error as Error).message }))
      .finally(() => setBusy(false))
  }, [open, user])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submitAuth = async () => {
    if (!email.trim() || !password || (mode === 'signup' && (password.length < 8 || !name.trim()))) {
      setMessage({ kind: 'error', text: 'Preencha os dados e use uma senha com pelo menos 8 caracteres.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signup') {
        await signUp(name, email, password)
        trackMetaStandard('CompleteRegistration', { content_name: 'Conta gratuita', status: true })
        setMessage({ kind: 'ok', text: 'Conta criada. Enviamos um link de verificação para seu e-mail.' })
      } else {
        await signIn(email, password)
      }
      setPassword('')
    } catch (error) {
      setMessage({ kind: 'error', text: friendlyAuthError(error) })
    } finally {
      setBusy(false)
    }
  }

  const choosePlan = async (plan: PlanId) => {
    if (plan === 'free') return
    if (!user) {
      setMode('signup')
      setMessage({ kind: 'ok', text: 'Crie sua conta antes de abrir o checkout seguro.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { url } = await startCheckout(plan)
      trackMetaStandard('InitiateCheckout', {
        content_name: `Plano ${PLANS[plan].name}`,
        content_category: 'Assinatura',
        value: PLANS[plan].priceMonthly,
        currency: 'BRL',
      })
      window.location.assign(url)
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message })
      setBusy(false)
    }
  }

  const refreshAccount = async () => setAccount(await loadAccount())

  const cancelRenewal = async () => {
    if (!window.confirm('Cancelar a renovação mensal? O acesso pago continua até o fim do período atual e não haverá nova cobrança.')) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await cancelSubscription()
      await refreshAccount()
      setMessage({ kind: 'ok', text: `Renovação cancelada. Seu acesso continua até ${new Date(result.accessUntil).toLocaleDateString('pt-BR')}.` })
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Conta e assinatura">
      <div className="mx-auto min-h-full max-w-5xl rounded-[2rem] border p-4 shadow-2xl sm:p-7" style={{ borderColor: 'var(--border)', background: 'var(--panel)', color: 'var(--text)' }}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: 'var(--brand-strong)' }}>AlvoPrompter SaaS</p><h2 className="mt-1 text-2xl font-extrabold">Conta e assinatura</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Cobrança recorrente processada no checkout seguro do Asaas.</p></div>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: 'var(--bg)', color: 'var(--muted)' }} aria-label="Fechar conta">×</button>
        </div>

        {message ? <p className="mt-5 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: message.kind === 'error' ? 'var(--danger)' : 'var(--ok)', color: message.kind === 'error' ? 'var(--danger)' : 'var(--ok)' }}>{message.text}</p> : null}

        {!firebaseConfigured ? (
          <div className="mt-8 rounded-3xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em]" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Modo local</span>
            <h3 className="mt-3 font-bold">Sua conta online ainda não está ativa neste beta</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>Você pode criar roteiros, usar o prompter e gravar normalmente neste dispositivo. Sincronização, equipe, backup e assinatura serão liberados quando o acesso online for ativado.</p>
          </div>
        ) : !authReady ? (
          <p className="mt-10 text-center text-sm" style={{ color: 'var(--muted)' }}>Carregando conta…</p>
        ) : !user ? (
          <div className="mx-auto mt-8 max-w-md rounded-3xl border p-5 sm:p-7" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="grid grid-cols-2 rounded-2xl p-1" style={{ background: 'var(--panel)' }}>
              <button onClick={() => setMode('signin')} className="min-h-10 rounded-xl text-sm font-bold" style={{ background: mode === 'signin' ? 'var(--bg)' : 'transparent', color: mode === 'signin' ? 'var(--text)' : 'var(--muted)' }}>Entrar</button>
              <button onClick={() => setMode('signup')} className="min-h-10 rounded-xl text-sm font-bold" style={{ background: mode === 'signup' ? 'var(--bg)' : 'transparent', color: mode === 'signup' ? 'var(--text)' : 'var(--muted)' }}>Criar conta</button>
            </div>
            {requestedPlan ? <p className="mt-4 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Plano escolhido: {PLANS[requestedPlan].name}. Após entrar, confirme a assinatura.</p> : null}
            {mode === 'signup' ? <label className="mt-5 block text-sm font-semibold">Nome<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-2 min-h-12 w-full rounded-2xl border bg-transparent px-4 outline-none" style={{ borderColor: 'var(--border)' }} /></label> : null}
            <label className="mt-4 block text-sm font-semibold">E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" className="mt-2 min-h-12 w-full rounded-2xl border bg-transparent px-4 outline-none" style={{ borderColor: 'var(--border)' }} /></label>
            <label className="mt-4 block text-sm font-semibold">Senha<input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submitAuth() }} type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="mt-2 min-h-12 w-full rounded-2xl border bg-transparent px-4 outline-none" style={{ borderColor: 'var(--border)' }} /></label>
            <button onClick={() => void submitAuth()} disabled={busy} className="mt-5 min-h-12 w-full rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand-gradient)' }}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta grátis' : 'Entrar'}</button>
            {mode === 'signin' ? <button onClick={() => { if (!email.trim()) setMessage({ kind: 'error', text: 'Informe seu e-mail primeiro.' }); else void resetPassword(email).then(() => setMessage({ kind: 'ok', text: 'Se a conta existir, enviaremos a recuperação por e-mail.' })).catch((error) => setMessage({ kind: 'error', text: friendlyAuthError(error) })) }} className="mt-3 min-h-10 w-full text-sm font-semibold" style={{ color: 'var(--brand-strong)' }}>Esqueci minha senha</button> : null}
          </div>
        ) : (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-3xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div><p className="font-bold">{user.displayName || 'Minha conta'}</p><p className="text-sm" style={{ color: 'var(--muted)' }}>{user.email} · Plano {PLANS[account?.subscription.plan ?? 'free'].name}</p>{account ? <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{account.usage.aiActions} de {account.limits.aiActionsMonthly} usos de IA neste mês</p> : null}{account?.subscription.currentPeriodEnd ? <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Ciclo atual até {new Date(account.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}</p> : null}</div>
            <div className="flex flex-wrap gap-2">{account?.subscription.status === 'active' ? <button onClick={() => void cancelRenewal()} disabled={busy} className="min-h-11 rounded-2xl border px-4 text-sm font-bold disabled:opacity-50" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>Cancelar renovação</button> : null}<button onClick={() => void signUserOut()} className="min-h-11 rounded-2xl border px-4 text-sm font-bold" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>Sair da conta</button></div>
          </div>
        )}

        {user && !user.emailVerified ? <div className="mt-5 rounded-2xl border p-4">
          <p className="text-sm">Confirme seu e-mail para aceitar convites de equipe e assinar um plano.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="min-h-11 rounded-xl border px-3 text-sm" disabled={busy} onClick={() => void resendVerification().then(() => setMessage({kind:'ok',text:'Enviamos um novo link de confirmação.'})).catch((error) => setMessage({kind:'error',text:friendlyAuthError(error)}))}>Reenviar confirmação</button>
            <button className="min-h-11 rounded-xl border px-3 text-sm" disabled={busy} onClick={() => void refreshVerifiedUser().then(async (verified) => { await refreshAccount(); setMessage({kind:verified?'ok':'error',text:verified?'E-mail confirmado.':'Abra o link enviado ao seu e-mail e tente novamente.'}) }).catch((error) => setMessage({kind:'error',text:friendlyAuthError(error)}))}>Já confirmei meu e-mail</button>
          </div>
        </div> : null}
        {user && account ? <section className="mt-7 rounded-3xl border p-5" style={{borderColor:'var(--border)',background:'var(--bg)'}}>
          <h3 className="font-bold">Sua equipe e seus roteiros</h3>
          <p className="mt-2 text-sm" style={{color:'var(--muted)'}}>Abra um workspace para sincronizar roteiros e agenda, gerenciar acessos e compartilhar sua identidade visual.</p>
          <button className="mt-4 min-h-11 rounded-2xl border px-4 text-sm font-bold" onClick={() => { useAppStore.getState().setView('workspaces'); onClose() }}>Abrir equipe e sincronização</button>
        </section> : null}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <PlanCard planId="free" currentPlan={account?.subscription.plan ?? 'free'} busy={busy} onChoose={choosePlan} />
          {PAID_PLAN_IDS.map((planId) => <PlanCard key={planId} planId={planId} currentPlan={account?.subscription.plan ?? 'free'} busy={busy} onChoose={choosePlan} />)}
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Valores de lançamento durante o beta. Os planos pagos são mensais e recorrentes. O acesso só é liberado após confirmação do Asaas. Nenhum dado de cartão passa pelo AlvoPrompter.</p>
      </div>
    </div>
  )
}
