import { useId, useRef, useState } from 'react'
import { firebaseConfigured, requestAccount, resetPassword, signIn, signInSocial, signUp, socialAvailability } from '../../lib/auth'
import { friendlyAuthError, isAuthCancellation, signupError } from '../../lib/authMessages'
import { trackMetaStandard } from '../../lib/metaPixel'

type Mode = 'signin' | 'signup'
export default function AuthForm({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const signup = mode === 'signup'
  const social = socialAvailability()
  const run = async (action: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage(null)
    try { await action() }
    catch (error) { if (!isAuthCancellation(error)) setMessage({ text: friendlyAuthError(error), error: true }) }
    finally { inFlight.current = false; setBusy(false) }
  }
  if (!firebaseConfigured) return <p className="account-copy text-sm">O acesso online está indisponível. Você pode continuar no modo local.</p>
  return <div className="auth-form space-y-4">
    <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--panel)' }} aria-label="Tipo de acesso">
      {(['signin', 'signup'] as const).map((value) => <button key={value} type="button" className="team-button" aria-pressed={mode === value} disabled={busy} onClick={() => { onModeChange(value); setMessage(null); setPassword(''); setConfirmation(''); setShowPassword(false) }}>{value === 'signin' ? 'Entrar' : 'Criar conta'}</button>)}
    </div>
    <div className="grid gap-2">
      <button type="button" className="team-button flex items-center justify-center gap-3" disabled={busy || !social.google} onClick={() => void run(() => signInSocial('google'))}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>Continuar com Google</button>
      <button type="button" className="team-button flex items-center justify-center gap-3" disabled={busy || !social.apple} onClick={() => void run(() => signInSocial('apple'))}><svg aria-hidden="true" width="18" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.54c.03 3.03 2.66 4.04 2.69 4.05-.02.07-.42 1.44-1.39 2.85-.84 1.22-1.71 2.44-3.08 2.47-1.34.03-1.78-.8-3.31-.8-1.53 0-2.01.77-3.28.83-1.32.05-2.32-1.33-3.17-2.55-1.73-2.51-3.05-7.1-1.28-10.2.88-1.54 2.45-2.51 4.15-2.54 1.29-.02 2.51.88 3.3.88.79 0 2.28-1.09 3.84-.93.65.03 2.46.26 3.62 1.95-.09.06-2.16 1.25-2.14 3.99ZM14.53 5.1c.7-.85 1.18-2.04 1.05-3.22-1.01.04-2.24.67-2.97 1.52-.65.75-1.22 1.95-1.07 3.1 1.13.09 2.29-.58 2.99-1.4Z"/></svg>Continuar com Apple</button>
      {(!social.google || !social.apple) ? <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{!social.google ? 'O acesso social ainda não está ativado nesta versão do aplicativo. Use e-mail e senha.' : 'O acesso com Apple estará disponível após a ativação do serviço. Use Google ou e-mail.'}</p> : null}
    </div>
    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-soft)' }}><span className="h-px flex-1" style={{ background: 'var(--border)' }} />ou use seu e-mail<span className="h-px flex-1" style={{ background: 'var(--border)' }} /></div>
    {message ? <p id={`${id}-message`} role={message.error ? 'alert' : 'status'} className="account-copy rounded-xl border p-3 text-sm leading-relaxed" style={{ color: message.error ? 'var(--danger)' : 'var(--ink-soft)', borderColor: message.error ? 'var(--danger)' : 'var(--border)' }}>{message.text}</p> : null}
    <form onSubmit={(event) => { event.preventDefault(); const error = signup ? signupError(name, password, confirmation) : null; if (error) { setMessage({ text: error, error: true }); return } void run(async () => { if (signup) { await signUp(name, email, password); requestAccount(); trackMetaStandard('CompleteRegistration', { content_name: 'Conta gratuita', status: true }) } else await signIn(email, password); setPassword(''); setConfirmation('') }) }} aria-busy={busy}>
      <fieldset className="space-y-4" disabled={busy}>
        {signup ? <label htmlFor={`${id}-name`}>Nome completo<input id={`${id}-name`} name="name" className="team-field" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label> : null}
        <label htmlFor={`${id}-email`}>E-mail<input id={`${id}-email`} name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" className="team-field" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label htmlFor={`${id}-password`}>Senha<input id={`${id}-password`} name="password" type={showPassword ? 'text' : 'password'} className="team-field" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} maxLength={signup ? 128 : undefined} aria-describedby={signup ? `${id}-hint` : undefined} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {signup ? <><p id={`${id}-hint`} className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Use pelo menos 8 caracteres. Uma frase longa e exclusiva é mais fácil de lembrar. Você pode usar seu gerenciador de senhas.</p><label htmlFor={`${id}-confirm`}>Confirme a senha<input id={`${id}-confirm`} name="confirm-password" type={showPassword ? 'text' : 'password'} className="team-field" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label></> : null}
        <button type="button" className="team-back" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ocultar senha' : 'Mostrar senha'}</button>
        <button type="submit" className="team-button team-primary w-full">{busy ? 'Aguarde…' : signup ? 'Criar minha conta' : 'Entrar na minha conta'}</button>
      </fieldset>
    </form>
    {!signup ? <button type="button" disabled={busy} className="team-back w-full text-center" onClick={() => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setMessage({ text: 'Informe seu e-mail no campo acima para recuperar a senha.', error: true }); return } void run(async () => { await resetPassword(email); setMessage({ text: 'Se houver uma conta, enviaremos as instruções de recuperação por e-mail.', error: false }) }) }}>Esqueci minha senha</button> : <p className="account-copy text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Enviaremos um link para confirmar seu e-mail. Você poderá completar seu perfil na conta; telefone e organização são opcionais.</p>}
  </div>
}
