import { useEffect, useId, useRef, useState } from 'react'
import { firebaseConfigured, requestAccount, resetPassword, signIn, signInSocial, signUp, socialAvailability } from '../../lib/auth'
import { friendlyAuthError, isAuthCancellation, signupError } from '../../lib/authMessages'
import { trackMetaStandard } from '../../lib/metaPixel'

type Mode = 'signin' | 'signup'
export default function AuthForm({ mode, onModeChange, onRecoveryChange }: { mode: Mode; onModeChange: (mode: Mode) => void; onRecoveryChange?: (active: boolean) => void }) {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [requestedEmail, setRequestedEmail] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const inFlight = useRef(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const signup = mode === 'signup'
  const social = socialAvailability()
  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    tick()
    if (!retryAt) return
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  const run = async (action: () => Promise<unknown>, recovery = false) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage(null)
    try { await action() }
    catch (error) { if (!isAuthCancellation(error)) setMessage({ text: friendlyAuthError(error, recovery ? 'recovery' : 'signin'), error: true }) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const switchMode = (next: Mode) => {
    onModeChange(next); setRecovering(false); onRecoveryChange?.(false); setRequestedEmail(''); setMessage(null)
    setPassword(''); setConfirmation(''); setShowPassword(false)
  }
  const recover = () => {
    if (Date.now() < retryAt) return
    void run(async () => {
      await resetPassword(email)
      setRequestedEmail(email.trim()); setSecondsLeft(60); setRetryAt(Date.now() + 60_000)
    }, true)
  }
  if (!firebaseConfigured) return <p className="text-sm">O acesso à conta está indisponível. Você pode usar o app sem conta, salvando seus arquivos neste dispositivo.</p>
  return <div className="auth-form">
    {recovering ? <>
      <button type="button" className="auth-link mb-4" disabled={busy} onClick={() => switchMode('signin')}>← Voltar para entrar</button>
      <div className="auth-recovery-icon" aria-hidden="true">✉</div>
      <h3 className="mt-3 text-xl font-bold">{requestedEmail ? 'Confira seu e-mail' : 'Recupere sua senha'}</h3>
      {requestedEmail ? <div className="auth-notice mt-3" role="status">
        <strong className="block">Solicitação recebida</strong>
        <p className="mt-1">Endereço informado: <strong className="break-all">{requestedEmail}</strong>.</p>
        <p className="mt-2">Para endereços cadastrados, o link pode levar alguns minutos. Confira a caixa de entrada e o spam.</p>
      </div> : <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>Informe o e-mail da sua conta para solicitar um link de redefinição.</p>}
    </> : <>
      <div className="auth-tabs" aria-label="Tipo de acesso">
        {(['signin', 'signup'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => switchMode(value)}>{value === 'signin' ? 'Entrar' : 'Criar conta'}</button>)}
      </div>
      {(social.google || social.apple) && <>
        <div className="grid gap-2 mt-5">
          {social.google && <button type="button" className="team-button auth-social" disabled={busy} onClick={() => void run(() => signInSocial('google'))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>Continuar com Google</button>}
          {social.apple && <button type="button" className="team-button auth-social" disabled={busy} onClick={() => void run(() => signInSocial('apple'))}><svg aria-hidden="true" width="18" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.54c.03 3.03 2.66 4.04 2.69 4.05-.02.07-.42 1.44-1.39 2.85-.84 1.22-1.71 2.44-3.08 2.47-1.34.03-1.78-.8-3.31-.8-1.53 0-2.01.77-3.28.83-1.32.05-2.32-1.33-3.17-2.55-1.73-2.51-3.05-7.1-1.28-10.2.88-1.54 2.45-2.51 4.15-2.54 1.29-.02 2.51.88 3.3.88.79 0 2.28-1.09 3.84-.93.65.03 2.46.26 3.62 1.95-.09.06-2.16 1.25-2.14 3.99ZM14.53 5.1c.7-.85 1.18-2.04 1.05-3.22-1.01.04-2.24.67-2.97 1.52-.65.75-1.22 1.95-1.07 3.1 1.13.09 2.29-.58 2.99-1.4Z"/></svg>Continuar com Apple</button>}
        </div>
        <div className="auth-divider">ou entre com e-mail</div>
      </>}
    </>}
    {message && <p id={`${id}-message`} role={message.error ? 'alert' : 'status'} className="auth-notice auth-error mt-4">{message.text}</p>}
    <form className="mt-5" onSubmit={event => {
      event.preventDefault()
      if (recovering) { recover(); return }
      const error = signup ? signupError(name, password, confirmation) : null
      if (error) { setMessage({ text: error, error: true }); return }
      void run(async () => {
        if (signup) { await signUp(name, email, password); requestAccount(); trackMetaStandard('CompleteRegistration', { content_name: 'Conta gratuita', status: true }) }
        else await signIn(email, password)
        setPassword(''); setConfirmation('')
      })
    }} aria-busy={busy}>
      <fieldset className="space-y-4" disabled={busy}>
        {signup && !recovering && <label htmlFor={`${id}-name`}>Nome completo<input id={`${id}-name`} name="name" className="team-field" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>}
        <label htmlFor={`${id}-email`}>E-mail<input id={`${id}-email`} name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" className="team-field" placeholder="voce@exemplo.com" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setRequestedEmail(''); setMessage(null) }} /></label>
        {!recovering && <>
          <label htmlFor={`${id}-password`}>Senha</label>
          <div className="auth-password">
            <input id={`${id}-password`} name="password" type={showPassword ? 'text' : 'password'} className="team-field" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} maxLength={signup ? 128 : undefined} aria-describedby={signup ? `${id}-hint` : undefined} value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          {signup ? <><p id={`${id}-hint`} className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Use pelo menos 8 caracteres. Prefira uma frase longa e exclusiva.</p><label htmlFor={`${id}-confirm`}>Confirme a senha<input id={`${id}-confirm`} name="confirm-password" type={showPassword ? 'text' : 'password'} className="team-field" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></> : <div className="text-right"><button type="button" className="auth-link" onClick={() => { setRecovering(true); onRecoveryChange?.(true); setMessage(null); setPassword(''); setShowPassword(false) }}>Esqueci minha senha</button></div>}
        </>}
        <button type="submit" className="team-button team-primary auth-submit w-full" disabled={recovering && secondsLeft > 0}>{busy ? (recovering ? 'Solicitando link…' : 'Aguarde…') : recovering ? (secondsLeft > 0 ? `Solicitar novamente em ${secondsLeft}s` : requestedEmail ? 'Reenviar link' : 'Solicitar link de recuperação') : signup ? 'Criar minha conta' : 'Entrar na minha conta'}</button>
      </fieldset>
    </form>
    {recovering && <div className="auth-help mt-5">
      <strong className="text-sm">Não encontrou o e-mail?</strong>
      <p className="mt-1 text-sm leading-relaxed">Confira o endereço e procure por AlvoPrompter no spam. Aguarde alguns minutos antes de solicitar outro link.</p>
      {social.google && <><p className="mt-3 text-sm leading-relaxed">Se você costuma entrar com Google, pode acessar sua conta por ele, sem redefinir uma senha do app.</p><button type="button" className="auth-link mt-2" disabled={busy} onClick={() => void run(() => signInSocial('google'))}>Entrar com Google</button></>}
    </div>}
    {signup && !recovering && <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Após o cadastro, confirme seu e-mail. Telefone e organização podem ser preenchidos depois, na sua conta.</p>}
  </div>
}
