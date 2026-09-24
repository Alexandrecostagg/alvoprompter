import { useEffect, useState } from 'react'
import { observeUser, requestAccount } from '../../lib/auth'
import { accountFetch, createCloudWorkspace, inviteWorkspaceMember, loadAccount, type AccountSummary, type SaaSWorkspace } from '../../lib/saas'
import { copyLocalScriptsToWorkspace, readCloudContent, syncCloudWorkspace, writeCloudContent } from '../../lib/cloudSync'
import { db } from '../../lib/db'
import { openLocalScripts } from '../../lib/localNavigation'
import { pullFromCloud } from '../../lib/syncWorker'
import { defaultBrandKit, ROLE_LABEL } from '../../lib/workspace'
import { useAppStore } from '../../store/useAppStore'
import type { BrandKit, TeamRole } from '../../lib/types'

type Member = { id: string; name: string; email: string; role: TeamRole; acceptedAt: string | null }
export default function CloudWorkspacesPanel() {
  const { cloudWorkspace, chooseCloudWorkspace, setView, loadScripts } = useAppStore()
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer' | 'admin'>('editor')
  const [members, setMembers] = useState<Member[]>([])
  const [brand, setBrand] = useState<BrandKit>(defaultBrandKit)
  const [brandRevision, setBrandRevision] = useState(0)
  const [legacyPass, setLegacyPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  const refresh = async () => setAccount(await loadAccount())
  useEffect(() => {
    let generation = 0
    const unsubscribe = observeUser((user) => {
      const current = ++generation
      setSignedIn(Boolean(user)); setAccount(null); setMembers([]); setMessage('')
      setLoading(Boolean(user))
      if (user) void loadAccount().then((data) => { if (current === generation) setAccount(data) })
        .catch(() => { if (current === generation) setMessage('Não foi possível carregar suas equipes. Verifique sua conexão e tente novamente.') })
        .finally(() => { if (current === generation) setLoading(false) })
    })
    return () => { generation++; unsubscribe() }
  }, [])
  const openWorkspace = async (workspace: SaaSWorkspace) => {
    const [people, kit] = await Promise.all([
      accountFetch<{ members: Member[] }>(`/account/workspaces/${workspace.id}/members`),
      readCloudContent<BrandKit>(workspace.id, 'brandkit'),
    ])
    await chooseCloudWorkspace(workspace)
    setMembers(people.members)
    const record = kit.records.find((r) => r.key === 'brandkit')
    const nextBrand = record?.payload ?? defaultBrandKit()
    setBrand(nextBrand); setBrandRevision(record?.revision ?? 0)
    const existing = await db.workspaces.filter((w) => w.key === `cloud:${workspace.id}`).first()
    const id = await db.workspaces.put({ ...existing, key: `cloud:${workspace.id}`, name: workspace.name, myRole: workspace.role, members: people.members, brandKit: nextBrand, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() })
    await useAppStore.getState().refreshWorkspaces()
    useAppStore.getState().setActiveWorkspace(id)
    const result = await syncCloudWorkspace(workspace.id)
    await loadScripts()
    setMessage(result.conflicts ? 'Edições simultâneas preservadas como cópias.' : 'Equipe aberta e sincronizada. Toque em Abrir roteiros para continuar.')
  }
  const button = 'team-button'
  const field = 'team-field'
  const manager = cloudWorkspace && ['owner', 'admin'].includes(cloudWorkspace.role)
  const owned = account?.workspaces.filter((workspace) => workspace.role === 'owner').length ?? 0
  const canCreate = Boolean(account && owned < account.limits.workspaces)
  return <div className="team-page mx-auto max-w-4xl space-y-5 px-4 py-5" lang="pt-BR">
    <button className="team-back" onClick={() => setView('library')}>← Voltar aos roteiros</button>
    <header>
      <p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--brand-strong)' }}>Seu espaço de trabalho</p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight">Equipe e sincronização</h1>
      <p className="account-copy mt-3 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Trabalhe por conta própria neste aparelho ou compartilhe roteiros com uma equipe. Você pode começar sem criar uma equipe.</p>
    </header>
    <section className="team-card" aria-labelledby="local-library-title">
      <span className="team-badge">Neste aparelho</span>
      <h2 id="local-library-title" className="mt-2 text-lg font-bold">Seu espaço pessoal</h2>
      <p className="account-copy mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Ainda não tem roteiros? Crie o primeiro agora. A biblioteca local é criada automaticamente e funciona sem uma equipe.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button className={`${button} team-primary`} disabled={busy} onClick={() => void run(() => openLocalScripts(true))}>Criar novo roteiro</button>
        <button className={button} disabled={busy} onClick={() => void run(() => openLocalScripts())}>Abrir biblioteca local</button>
      </div>
      <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>No modo local, os roteiros ficam somente neste dispositivo.</p>
    </section>
    {message ? <p role="status" className="account-copy rounded-xl border p-3 text-sm leading-relaxed">{message}</p> : null}
    <section className="team-card" aria-labelledby="cloud-teams-title">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="cloud-teams-title" className="text-lg font-bold">Equipes na nuvem</h2><button className="team-back text-sm" onClick={requestAccount}>Conta e planos →</button></div>
      {!signedIn ? <><p className="account-copy my-3 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Entre na sua conta para ver suas equipes e os convites recebidos.</p><button className={button} onClick={requestAccount}>Entrar na minha conta</button></>
        : loading ? <p role="status" className="py-4 text-sm">Carregando suas equipes…</p>
        : !account ? <button className={`${button} mt-3`} disabled={busy} onClick={() => void run(refresh)}>Tentar carregar novamente</button>
        : <>
          {!account.workspaces.length ? <p className="account-copy my-3 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>Você ainda não participa de uma equipe. Continue no seu espaço pessoal ou crie uma equipe quando precisar de sincronização.</p> : <div className="my-3 grid gap-2 sm:grid-cols-2">{account.workspaces.map((workspace) => <button key={workspace.id} className={`${button} text-left`} disabled={busy} aria-pressed={workspace.id === cloudWorkspace?.id} onClick={() => void run(() => openWorkspace(workspace))}><span className="block break-words font-bold">{workspace.name}</span><span className="mt-1 block text-xs font-normal">{ROLE_LABEL[workspace.role]}{workspace.id === cloudWorkspace?.id ? ' · Selecionada' : ''}</span></button>)}</div>}
          {canCreate ? <form className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }} onSubmit={(event) => { event.preventDefault(); if (busy || name.trim().length < 2) return; void run(async () => { const result = await createCloudWorkspace(name.trim()); setName(''); await refresh(); await openWorkspace(result.workspace) }) }}>
            <label className="block text-sm font-semibold">Nome da equipe<input required minLength={2} maxLength={80} className={`${field} mt-2 w-full`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Conteúdo da minha marca" /></label>
            <button type="submit" className={`${button} team-primary w-full sm:w-auto`} disabled={busy || name.trim().length < 2}>Criar equipe</button>
          </form> : <p className="account-copy mt-3 rounded-xl p-3 text-sm leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}>{account.limits.workspaces === 0 ? 'O plano Grátis inclui o espaço pessoal. Para criar uma equipe na nuvem, escolha Criador ou Studio em Conta e planos. Convites de equipes Studio podem ser aceitos com sua conta gratuita.' : 'Você já criou todas as equipes incluídas no seu plano. Abra uma das equipes acima ou consulte Conta e planos.'}</p>}
        </>}
    </section>
    {signedIn ? <>
      {cloudWorkspace ? <section className="team-card space-y-4">
        <h2 className="text-lg font-bold">{cloudWorkspace.name}</h2>
        <p>Seu acesso: {ROLE_LABEL[cloudWorkspace.role]}</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void run(() => openWorkspace(cloudWorkspace))}>Sincronizar agora</button><button className={button} onClick={() => setView('library')}>Abrir roteiros</button>
        {cloudWorkspace.role !== 'viewer' ? <button className={button} disabled={busy} onClick={() => void run(async () => { const count = await copyLocalScriptsToWorkspace(cloudWorkspace.id); await syncCloudWorkspace(cloudWorkspace.id); await loadScripts(); setMessage(`${count} roteiro(s) copiado(s). Os originais locais foram mantidos.`) })}>Copiar meus roteiros locais</button> : null}</div>
        <ul className="space-y-2">{members.map((member) => <li key={member.id}>{member.name || member.email} · {ROLE_LABEL[member.role]}{!member.acceptedAt ? ' · aguardando e-mail confirmado' : ''}</li>)}</ul>
        {manager ? <>
          <div className="flex flex-wrap gap-2"><input aria-label="E-mail do membro" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do membro" /><select aria-label="Acesso do membro" className={field} value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="editor">Editor</option><option value="viewer">Leitor</option>{cloudWorkspace.role === 'owner' ? <option value="admin">Administrador</option> : null}</select><button className={button} disabled={busy || !email.trim()} onClick={() => void run(async () => { await inviteWorkspaceMember(cloudWorkspace.id, { email, name: email.split('@')[0]!, role }); setEmail(''); await openWorkspace(cloudWorkspace) })}>Convidar</button></div>
          <h3 className="font-bold">Identidade visual compartilhada</h3>
          <label className="block">Nome da marca<input className={`${field} mt-2 block w-full`} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label>
          <div className="flex flex-wrap gap-4"><label>Cor principal <input type="color" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} /></label><label>Cor de destaque <input type="color" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} /></label></div>
          <label className="block">Logo da equipe (PNG, JPG ou WebP, até 250 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 250000) { setMessage('Use uma logo de até 250 KB.'); return } const reader = new FileReader(); reader.onload = () => setBrand({ ...brand, logoDataUrl: String(reader.result) }); reader.readAsDataURL(file) }} /></label>
          <button className={button} disabled={busy} onClick={() => void run(async () => { await writeCloudContent(cloudWorkspace.id, 'brandkit', 'brandkit', brand, brandRevision); await openWorkspace(cloudWorkspace); setMessage('Identidade visual salva na equipe.') })}>Salvar identidade visual</button>
        </> : null}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>A agenda sincroniza datas e legendas. Os arquivos de vídeo continuam no aparelho em que foram gravados.</p>
      </section> : null}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Recuperar roteiros da sincronização antiga</summary><p className="account-copy my-3 text-sm leading-relaxed">Recupere uma cópia local usando sua frase antiga. Depois selecione uma equipe e copie os roteiros para sua conta.</p><input autoComplete="off" aria-label="Frase-chave antiga" type="password" className={`${field} w-full`} value={legacyPass} onChange={(e) => setLegacyPass(e.target.value)} /><button className={`${button} mt-3 w-full sm:w-auto`} disabled={busy || legacyPass.trim().length < 12} onClick={() => void run(async () => { const rows = await pullFromCloud(legacyPass); let count = 0; for (const row of rows) { if (await db.scripts.where('key').equals(row.key).first()) continue; await db.scripts.add({ ...row, id: undefined }); count++ } setLegacyPass(''); await chooseCloudWorkspace(null); setMessage(`${count} roteiro(s) recuperado(s) na biblioteca local.`) })}>Recuperar cópia local</button></details>
    </> : null}
  </div>
}
