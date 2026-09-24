import { useState } from 'react'
import { saveAccountProfile, type AccountProfile } from '../../lib/saas'

export default function ProfileForm({ profile, defaultName, onSaved }: { profile?: AccountProfile | null; defaultName: string; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(!profile)
  const [name, setName] = useState(profile?.fullName ?? defaultName)
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [organization, setOrganization] = useState(profile?.organization ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  return <section className="team-card mt-4" aria-labelledby="profile-title">
    <div className="flex items-center justify-between gap-3"><h3 id="profile-title" className="font-bold">{profile ? 'Dados do perfil' : 'Complete seu perfil'}</h3><button type="button" className="team-back" disabled={busy} aria-expanded={editing} onClick={() => { setEditing(!editing); setMessage(null) }}>{editing ? 'Recolher' : 'Editar'}</button></div>
    {!editing && profile ? <p className="mt-1 break-words text-sm" style={{ color: 'var(--ink-soft)' }}>{profile.fullName}{profile.organization ? ` · ${profile.organization}` : ''}</p> : null}
    {message ? <p role={message.error ? 'alert' : 'status'} className="account-copy mt-3 text-sm leading-relaxed" style={{ color: message.error ? 'var(--danger)' : 'var(--ink-soft)' }}>{message.text}</p> : null}
    {editing ? <form className="auth-form mt-3" onSubmit={(event) => { event.preventDefault(); if (busy) return; setBusy(true); setMessage(null); void saveAccountProfile({ fullName: name, phone, organization }).then(async ({ profile: saved }) => { setName(saved.fullName); setPhone(saved.phone); setOrganization(saved.organization); try { await onSaved(); setEditing(false); setMessage({ text: 'Perfil salvo.', error: false }) } catch { setMessage({ text: 'Perfil salvo. Reabra a conta para atualizar o resumo.', error: false }) } }).catch((error) => setMessage({ text: (error as Error).message, error: true })).finally(() => setBusy(false)) }}>
      <fieldset disabled={busy} className="space-y-4">
        <p className="account-copy text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Telefone e organização são opcionais. O telefone fica no seu perfil e não é usado para entrar na conta.</p>
        <label>Nome completo<input name="profile-name" className="team-field" required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Telefone com DDD <span className="font-normal">(opcional)</span><input name="phone" className="team-field" type="tel" autoComplete="tel" maxLength={30} placeholder="Ex.: +55 91 99999-9999" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Empresa ou organização <span className="font-normal">(opcional)</span><input name="organization" className="team-field" autoComplete="organization" maxLength={100} value={organization} onChange={(event) => setOrganization(event.target.value)} /></label>
        <button type="submit" className="team-button team-primary w-full sm:w-auto">{busy ? 'Salvando…' : 'Salvar perfil'}</button>
      </fieldset>
    </form> : null}
  </section>
}
