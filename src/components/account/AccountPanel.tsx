import LegalLinks from './LegalLinks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { firebaseConfigured, observeUser, resendVerification, refreshVerifiedUser, signUserOut, type User } from '../../lib/auth'
import { formatPlanPrice, PAID_PLAN_IDS, PLANS, type PlanId } from '../../lib/plans'
import { cancelSubscription, loadAccount, startCheckout, requestTemporaryAccess, type AccountSummary } from '../../lib/saas'
import { useAppStore } from '../../store/useAppStore'
import { trackMetaStandard } from '../../lib/metaPixel'

import AuthForm from './AuthForm'
import ProfileForm from './ProfileForm'
import AdminAccessPanel from './AdminAccessPanel'
import DeleteAccountPanel from './DeleteAccountPanel'
import { friendlyAuthError } from '../../lib/authMessages'
import { confirmAccountEmail } from '../../lib/accountVerification'
import { loadBillingAvailability, type BillingAvailability } from '../../lib/billing'
import { buyApplePlan, isAppleApp, loadApplePrices, manageAppleSubscription, restoreApplePlans } from '../../lib/applePurchases'
import { buyGooglePlan, loadGooglePrices, manageGoogleSubscription, restoreGooglePlans } from '../../lib/googlePurchases'
import { Capacitor } from '@capacitor/core'

type AuthMode = 'signin' | 'signup'

function PlanCard({ planId, currentPlan, busy, available, checking, verified, price, action, onChoose }: { planId: PlanId; currentPlan: PlanId | null; busy: boolean; available: boolean; checking: boolean; verified: boolean; price: string; action: string; onChoose: (plan: PlanId) => void }) {
  const plan = PLANS[planId]
  const current = currentPlan === planId
  const anotherPaidPlan = planId !== 'free' && currentPlan !== null && currentPlan !== 'free'
  return (
    <article className="relative flex h-full flex-col rounded-2xl border p-4 sm:p-5" style={{ borderColor: plan.badge ? 'var(--accent)' : 'var(--border)', background: plan.badge ? 'var(--accent-soft)' : 'var(--bg)' }}>
      {plan.badge ? <span className="mb-3 w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--brand-gradient)', color: 'white' }}>{plan.badge}</span> : null}
      <h3 className="text-lg font-bold">{plan.name}</h3>
      {plan.priceMonthly > 0 ? <p className="mt-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--ink-soft)' }}>Assinatura mensal</p> : null}
      <p className={plan.priceMonthly > 0 ? 'mt-1 text-3xl font-extrabold' : 'mt-2 text-3xl font-extrabold'}>{price}{plan.priceMonthly > 0 ? <span className="text-sm font-medium" style={{ color: 'var(--ink-soft)' }}>/mês</span> : null}</p>
      <p className="account-copy mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{plan.description}</p>
      <ul className="my-4 space-y-2 text-sm leading-relaxed">
        {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span style={{ color: 'var(--ok)' }}>✓</span><span>{feature}</span></li>)}
      </ul>
      <button disabled={busy || current || anotherPaidPlan || planId === 'free' || !available || !verified} onClick={() => onChoose(planId)} className="mt-auto min-h-11 rounded-2xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: planId === 'free' ? 'var(--panel)' : 'var(--brand-gradient)', color: planId === 'free' ? 'var(--muted)' : 'white' }}>
        {current ? 'Plano atual' : planId === 'free' ? 'Incluído' : anotherPaidPlan ? 'Já possui um plano' : checking ? 'Verificando…' : !available ? 'Indisponível no momento' : !verified ? 'Confirme seu e-mail' : busy ? 'Aguarde…' : action}
      </button>
    </article>
  )
}

export default function AccountPanel({ open, initialPlan, onClose }: { open: boolean; initialPlan?: PlanId | null; onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessPlan, setAccessPlan] = useState<'creator' | 'studio'>('creator')
  const [showAdmin, setShowAdmin] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [accountRevision, setAccountRevision] = useState(0)
  const [accountFailed, setAccountFailed] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [billing, setBilling] = useState<BillingAvailability | null>(null)
  const [billingChecking, setBillingChecking] = useState(true)
  const [billingFailed, setBillingFailed] = useState(false)
  const [billingRevision, setBillingRevision] = useState(0)
  const [storePrices, setStorePrices] = useState<Partial<Record<'creator' | 'studio', string>>>({})
  const [storePriceError, setStorePriceError] = useState(false)
  const appleApp = isAppleApp()
  const androidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  const nativeStore = appleApp || androidApp
  const storeName = appleApp ? 'App Store' : 'Google Play'
  const storeConfigured = appleApp ? billing?.appleConfigured : billing?.googleConfigured
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const requestedPlan = useMemo(() => initialPlan && initialPlan !== 'free' ? initialPlan : null, [initialPlan])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = overflow; previousFocus?.focus() }
  }, [open])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setBillingChecking(true)
    setBillingFailed(false)
    setBilling(null)
    loadBillingAvailability(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setBilling(result) })
      .catch(() => { if (!controller.signal.aborted) setBillingFailed(true) })
      .finally(() => { if (!controller.signal.aborted) setBillingChecking(false) })
    return () => controller.abort()
  }, [open, billingRevision])

  useEffect(() => {
    if (!open || !nativeStore || !storeConfigured) return
    let active = true
    setStorePrices({})
    setStorePriceError(false);
    (appleApp ? loadApplePrices() : loadGooglePrices()).then((prices) => { if (active) { setStorePrices(prices); setStorePriceError(Object.keys(prices).length === 0) } })
      .catch(() => { if (active) setStorePriceError(true) })
    return () => { active = false }
  }, [open, nativeStore, appleApp, storeConfigured, billingRevision])

  useEffect(() => { if (message) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }, [message])

  useEffect(() => observeUser((next) => {
    setUser(next)
    setEmailVerified(next?.emailVerified ?? false)
    setAuthReady(true)
    if (!next) { setAccount(null); setShowAdmin(false) }
  }), [])

  useEffect(() => {
    if (!open || !user) return
    let active = true
    setBusy(true)
    setAccount(null)
    setAccountFailed(false)
    setMessage(null)
    loadAccount()
      .then((result) => { if (active) setAccount(result) })
      .catch((error) => { if (active) { setAccountFailed(true); setMessage({ kind: 'error', text: (error as Error).message }) } })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [open, user, accountRevision])

  useEffect(() => {
    if (!open || !user || !nativeStore) return
    let active = true
    let remove: (() => Promise<void>) | undefined
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && active) void refreshVerifiedUser().then((verified) => {
        if (active) setEmailVerified(verified)
        return loadAccount()
      }).then((result) => { if (active) { setAccount(result); setAccountFailed(false) } }).catch(() => { if (active) setAccountFailed(true) })
    })).then((listener) => { if (active) remove = () => listener.remove(); else void listener.remove() })
    return () => { active = false; if (remove) void remove() }
  }, [open, user, nativeStore])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const dialog = closeRef.current?.closest('[role="dialog"]')
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const choosePlan = async (plan: PlanId) => {
    if (plan === 'free' || busy || billingChecking || (nativeStore ? !storeConfigured || !storePrices[plan] : !billing?.configured)) return
    if (!user) {
      setMode('signup')
      setMessage({ kind: 'ok', text: 'Crie sua conta antes de abrir o checkout seguro.' })
      return
    }
    if (!account || accountFailed) {
      setMessage({ kind: 'error', text: 'Recarregue seu plano antes de iniciar uma assinatura. Nenhuma compra foi iniciada.' })
      return
    }
    if (!emailVerified) {
      setMessage({ kind: 'error', text: 'Confirme seu e-mail antes de assinar um plano.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      if (appleApp) {
        await buyApplePlan(plan)
        await refreshAccount()
        setMessage({ kind: 'ok', text: 'Compra confirmada pela App Store. Seu plano foi atualizado.' })
        setBusy(false)
        return
      }
      if (androidApp) {
        const active = await buyGooglePlan(plan)
        await refreshAccount()
        setMessage({ kind: 'ok', text: active ? 'Compra confirmada pelo Google Play. Seu plano foi atualizado.' : 'Pagamento pendente no Google Play. O acesso será liberado após a confirmação; use Restaurar compras para conferir.' })
        setBusy(false)
        return
      }
      const { url } = await startCheckout(plan)
      trackMetaStandard('InitiateCheckout', {
        content_name: `Plano ${PLANS[plan].name}`,
        content_category: 'Assinatura',
        value: PLANS[plan].priceMonthly,
        currency: 'BRL',
      })
      window.location.assign(url)
    } catch (error) {
      if (!(nativeStore && /user cancell?ed|purchase cancelled|cancelada pelo usu/i.test((error as Error).message))) setMessage({ kind: 'error', text: (error as Error).message })
      setBusy(false)
    }
  }

  const refreshAccount = async () => { setAccount(await loadAccount()); setAccountFailed(false) }

  const confirmEmail = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await confirmAccountEmail()
      const verified = result.status !== 'unverified'
      setEmailVerified(verified)
      if (!verified) {
        setMessage({ kind: 'error', text: 'Abra o e-mail do AlvoPrompter, conclua a confirmação pelo link e tente novamente.' })
        return
      }
      if (result.status === 'verified') {
        setAccount(result.account)
        setAccountFailed(false)
        setMessage({ kind: 'ok', text: 'E-mail confirmado. Sua conta está pronta.' })
      } else {
        setAccountFailed(true)
        setMessage({ kind: 'error', text: 'Seu e-mail foi confirmado. Não conseguimos carregar seu plano; toque em “Recarregar plano” para tentar novamente. Nenhuma compra foi iniciada.' })
      }
    } catch (error) { setMessage({ kind: 'error', text: friendlyAuthError(error) }) }
    finally { setBusy(false) }
  }

  const cancelRenewal = async () => {
    if (account?.subscription.provider === 'apple') {
      try { await manageAppleSubscription() } catch (error) { setMessage({ kind: 'error', text: (error as Error).message }) }
      return
    }
    if (account?.subscription.provider === 'google') {
      try { if (androidApp) await manageGoogleSubscription(); else window.open('https://play.google.com/store/account/subscriptions', '_blank', 'noopener,noreferrer') } catch (error) { setMessage({ kind: 'error', text: (error as Error).message }) }
      return
    }
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
    <div className="account-overlay fixed inset-0 z-[80] flex bg-slate-950/60 backdrop-blur-sm" lang="pt-BR" role="dialog" aria-modal="true" aria-label="Conta e assinatura">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--panel)', color: 'var(--text)' }}>
        <header className="shrink-0 border-b px-4 py-4 sm:px-6" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--brand-strong)' }}>Sua conta</p><h2 className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">Conta e assinatura</h2></div>
            <button ref={closeRef} onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: 'var(--bg)', color: 'var(--ink-soft)' }} aria-label="Fechar conta">×</button>
          </div>
          <p className="account-copy mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Gerencie seu plano, acompanhe o uso de IA e organize sua equipe.</p>
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-6 sm:pb-6">

        {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className="account-copy mt-4 rounded-2xl border px-4 py-3 text-sm leading-relaxed" style={{ borderColor: message.kind === 'error' ? 'var(--danger)' : 'var(--ok)', color: message.kind === 'error' ? 'var(--danger)' : 'var(--ok)' }}>{message.text}</p> : null}

        {!firebaseConfigured ? (
          <div className="mt-8 rounded-3xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em]" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Modo local</span>
            <h3 className="mt-3 font-bold">Sua conta online ainda não está ativa neste beta</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Você pode criar roteiros, usar o prompter e gravar normalmente neste dispositivo. Sincronização, equipe, backup e assinatura serão liberados quando o acesso online for ativado.</p>
          </div>
        ) : !authReady ? (
          <p className="mt-10 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Carregando conta…</p>
        ) : !user ? (
          <div className="mx-auto mt-8 max-w-md rounded-3xl border p-5 sm:p-7" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            {requestedPlan ? <p className="mb-4 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Plano escolhido: {PLANS[requestedPlan].name}. Após entrar, confirme a assinatura.</p> : null}
            <AuthForm mode={mode} onModeChange={setMode} />
          </div>
        ) : (
          <section className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }} aria-label="Resumo da conta">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
              <div className="min-w-0 w-full flex-1"><h3 className="break-words font-bold leading-snug">{account?.profile?.fullName || user.displayName || 'Minha conta'}</h3><p className="mt-1 break-all text-sm" style={{ color: 'var(--ink-soft)' }}>{user.email}</p></div>
              <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>{account ? `Plano ${PLANS[account.subscription.plan].name}` : busy ? 'Carregando plano…' : 'Plano não carregado'}</span>
            </div>
            {account ? <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <p className="flex flex-wrap justify-between gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}><span>Uso de IA neste mês</span><strong>{account.usage.aiActions} de {account.limits.aiActionsMonthly}</strong></p>
              <progress className="account-usage mt-2 block h-1.5 w-full overflow-hidden rounded-full" aria-label="Uso mensal de IA" max={Math.max(1, account.limits.aiActionsMonthly)} value={Math.min(account.usage.aiActions, account.limits.aiActionsMonthly)} />
              {account.subscription.currentPeriodEnd ? <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Ciclo atual até {new Date(account.subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}</p> : null}
            </div> : null}
            <div className="mt-3 flex flex-wrap gap-2">{account?.subscription.status === 'active' ? <button onClick={() => void cancelRenewal()} disabled={busy} className="min-h-11 rounded-xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{account.subscription.provider === 'apple' ? 'Gerenciar na App Store' : account.subscription.provider === 'google' ? 'Gerenciar no Google Play' : 'Cancelar renovação'}</button> : null}<button onClick={() => void signUserOut().catch((error) => setMessage({ kind: 'error', text: friendlyAuthError(error) }))} disabled={busy} className="min-h-11 rounded-xl px-3 text-xs font-semibold disabled:opacity-50" style={{ color: 'var(--ink-soft)' }}>Sair da conta</button></div>
            {accountFailed ? <div className="mt-3 rounded-xl border p-3" role="status" style={{ borderColor: 'var(--border)' }}><p className="text-sm leading-relaxed">Não foi possível consultar seu plano. Recarregue antes de assinar. Seus arquivos neste aparelho continuam disponíveis.</p><button disabled={busy} className="mt-2 min-h-11 rounded-xl border px-3 text-sm font-bold disabled:opacity-50" onClick={() => setAccountRevision(value => value + 1)}>Recarregar plano</button></div> : null}
          </section>
        )}

        {user && account ? <section className="mt-5 space-y-3 rounded-2xl border p-4 sm:p-5" aria-label="Acesso temporário" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <h3 className="font-bold">Acesso por convite</h3>
          {account.access?.grant?.status === 'active' ? <p className="text-sm leading-relaxed">Você tem acesso temporário ao {PLANS[account.access.grant.plan].name} até <strong>{new Date(account.access.grant.expiresAt).toLocaleString('pt-BR')}</strong>. O benefício termina nessa data e não gera cobrança automática.</p> : <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Se você foi convidado para experimentar o app, escolha um plano e solicite a liberação. A administração define o período; a solicitação não contrata uma assinatura.</p>}
          {account.access?.grant?.status === 'expired' ? <p className="text-sm">Seu acesso temporário terminou. Você mantém o plano gratuito ou uma assinatura válida que já possui.</p> : null}
          {account.access?.request?.status === 'pending' ? <p role="status" className="text-sm font-semibold">Solicitação de {PLANS[account.access.request.plan].name} aguardando análise.</p> : null}
          {account.access?.request?.status === 'declined' ? <p className="text-sm">Sua solicitação foi encerrada. Se necessário, fale com a administração.</p> : null}
          {account.access?.request?.status === 'checkout_required' && account.subscription.plan === 'free' ? <p className="text-sm font-semibold">A administração indicou o plano {PLANS[account.access.request.plan].name}. Para continuar com os recursos pagos, confirme a assinatura nas opções abaixo. Nenhuma cobrança foi iniciada.</p> : null}
          {account.access?.grant?.status !== 'active' && account.access?.request?.status !== 'pending' ? <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-semibold">Plano para solicitar<select className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={accessPlan} onChange={e => setAccessPlan(e.target.value as typeof accessPlan)}><option value="creator">Criador</option><option value="studio">Studio</option></select></label><button disabled={busy || !emailVerified} className="min-h-11 rounded-xl border px-4 text-sm font-bold disabled:opacity-50" onClick={() => { setBusy(true); void requestTemporaryAccess(accessPlan).then(async () => { await refreshAccount(); setMessage({ kind: 'ok', text: 'Solicitação enviada. Aguarde a liberação da administração.' }) }).catch(e => setMessage({ kind: 'error', text: e.message })).finally(() => setBusy(false)) }}>Solicitar acesso temporário</button></div> : null}
          {account.isAdmin ? <button className="min-h-11 rounded-xl border px-4 text-sm font-bold" onClick={() => setShowAdmin(value => !value)} aria-expanded={showAdmin}>{showAdmin ? 'Fechar administração' : 'Abrir administração'}</button> : null}
        </section> : null}
        {user && account?.isAdmin && showAdmin ? <AdminAccessPanel /> : null}

        {user && account ? <ProfileForm key={user.uid} profile={account.profile} defaultName={user.displayName ?? account.user.name} onSaved={refreshAccount} /> : null}

        {user && !emailVerified ? <div className="mt-5 rounded-2xl border p-4">
          <p className="account-copy text-sm leading-relaxed">Confirme seu e-mail para usar IA, nuvem, convites de equipe e assinaturas. Você pode continuar escrevendo e gravando neste aparelho.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="min-h-11 rounded-xl border px-3 text-sm" disabled={busy} onClick={() => { setBusy(true); void resendVerification().then(() => setMessage({kind:'ok',text:'Enviamos um e-mail de confirmação do AlvoPrompter. Confira a caixa de entrada e o spam.'})).catch((error) => setMessage({kind:'error',text:friendlyAuthError(error)})).finally(() => setBusy(false)) }}>Reenviar confirmação</button>
            <button className="min-h-11 rounded-xl border px-3 text-sm" disabled={busy} onClick={() => void confirmEmail()}>Já confirmei meu e-mail</button>
          </div>
        </div> : null}
        <section className="mt-6" aria-labelledby="account-plans-title">
          <h3 id="account-plans-title" className="text-lg font-bold">Escolha seu plano</h3>
          <p className="account-copy mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Compare os recursos e encontre o plano ideal para sua rotina.</p>
          {account && account.subscription.plan !== 'free' && account.subscription.provider ? <p className="account-copy mt-2 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{account.subscription.provider === 'apple' ? 'Para trocar de plano ou cancelar, abra “Gerenciar na App Store” acima.' : account.subscription.provider === 'google' ? 'Para cancelar, abra “Gerenciar no Google Play” acima. Para trocar de plano, aguarde o fim do período atual.' : 'Para trocar de plano ou de loja, encerre a renovação atual e aguarde o fim do período contratado.'}</p> : null}
          <div className="mt-3 rounded-2xl border p-3 text-sm leading-relaxed" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--ink-soft)' }} role="status" aria-live="polite">
            <p className="account-copy">{billingChecking ? 'Verificando a disponibilidade das assinaturas…' : billingFailed ? 'Não foi possível consultar as assinaturas. Verifique sua conexão e tente novamente.' : nativeStore ? !storeConfigured || storePriceError ? `Compras ${appleApp ? 'pela' : 'pelo'} ${storeName} ainda indisponíveis. Seu plano atual continua funcionando.` : `Assinatura mensal ${appleApp ? 'pela' : 'pelo'} ${storeName}. Confira o preço final antes da confirmação.` : !billing?.configured ? 'As assinaturas estão temporariamente indisponíveis. Você pode continuar usando seu plano atual.' : billing.sandbox ? 'Pagamento em modo de teste. Nenhuma cobrança real será realizada.' : 'Pagamento seguro pelo Asaas. Assinatura mensal com renovação automática no cartão.'}</p>
            {!billingChecking && (billingFailed || (nativeStore ? !storeConfigured || storePriceError : !billing?.configured)) ? <button className="mt-2 min-h-11 rounded-xl border px-3 text-xs font-bold" style={{ borderColor: 'var(--border)', color: 'var(--brand-strong)' }} onClick={() => setBillingRevision((value) => value + 1)}>Verificar novamente</button> : null}
          </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <PlanCard planId="free" currentPlan={account?.subscription.plan ?? (user ? null : 'free')} busy={busy} available={false} checking={billingChecking} verified={!user || emailVerified} price={formatPlanPrice(0)} action="" onChoose={choosePlan} />
          {PAID_PLAN_IDS.map((planId) => <PlanCard key={planId} planId={planId} currentPlan={account?.subscription.plan ?? (user ? null : 'free')} busy={busy} available={(!user || Boolean(account) && !accountFailed) && (nativeStore ? Boolean(storeConfigured && storePrices[planId]) : Boolean(billing?.configured))} checking={billingChecking} verified={!user || emailVerified} price={nativeStore ? storePrices[planId] ?? '—' : formatPlanPrice(PLANS[planId].priceMonthly)} action={nativeStore ? `Assinar ${PLANS[planId].name} ${appleApp ? 'na' : 'no'} ${storeName}` : billing?.sandbox ? `Testar ${PLANS[planId].name}` : `Assinar ${PLANS[planId].name}`} onChoose={choosePlan} />)}
        </div>
        {nativeStore && user && emailVerified ? <button disabled={busy || !storeConfigured} onClick={() => { setBusy(true); void (appleApp ? restoreApplePlans() : restoreGooglePlans()).then(async (restored) => { await refreshAccount(); setMessage({ kind: 'ok', text: restored ? 'Compras restauradas e plano atualizado.' : `Nenhuma assinatura ativa encontrada para esta conta no ${storeName}.` }) }).catch((error) => setMessage({ kind: 'error', text: (error as Error).message })).finally(() => setBusy(false)) }} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Restaurar compras {appleApp ? 'da' : 'do'} {storeName}</button> : null}
        </section>
        {user && account ? <section className="mt-5 rounded-2xl border p-4 sm:p-5" style={{borderColor:'var(--border)',background:'var(--bg)'}}>
          <h3 className="font-bold">Sua equipe e seus roteiros</h3>
          <p className="account-copy mt-2 text-sm leading-relaxed" style={{color:'var(--ink-soft)'}}>Sincronize roteiros e agenda, gerencie os acessos e compartilhe a identidade visual da sua equipe.</p>
          <button className="mt-3 min-h-11 w-full rounded-xl border px-3 text-sm font-bold sm:w-auto" onClick={() => { useAppStore.getState().setView('workspaces'); onClose() }}>Abrir equipe e sincronização</button>
        </section> : null}

        <p className="account-copy mt-4 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{appleApp ? 'Os planos pagos são mensais e recorrentes. Cobrança, cancelamento e preço final são gerenciados pela App Store. O acesso só é liberado após confirmação da Apple.' : androidApp ? 'Os planos pagos são mensais e recorrentes. Cobrança e cancelamento são gerenciados pelo Google Play. O acesso só é liberado após confirmação do Google.' : 'Valores de lançamento durante o beta. Os planos pagos são mensais e recorrentes. O acesso só é liberado após confirmação do Asaas. Nenhum dado de cartão passa pelo AlvoPrompter.'}</p>
        {user ? <DeleteAccountPanel user={user} onComplete={onClose} /> : null}
        <LegalLinks />
        </div>
      </div>
    </div>
  )
}
