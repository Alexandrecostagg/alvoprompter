import { useEffect, useState } from 'react'
import { currentUser, requestAccount } from '../../lib/auth'
import { accountFetch, createCloudWorkspace, inviteWorkspaceMember, loadAccount, type AccountSummary, type SaaSWorkspace } from '../../lib/saas'
import { copyLocalScriptsToWorkspace, readCloudContent, syncCloudWorkspace, writeCloudContent } from '../../lib/cloudSync'
import { db } from '../../lib/db'
import { pullFromCloud } from '../../lib/syncWorker'
import { defaultBrandKit, ROLE_LABEL } from '../../lib/workspace'
import { useAppStore } from '../../store/useAppStore'
import type { BrandKit, TeamRole } from '../../lib/types'

type Member = { id: string; name: string; email: string; role: TeamRole; acceptedAt: string | null }
export default function CloudWorkspacesPanel() {
  const { cloudWorkspace, chooseCloudWorkspace, setView, loadScripts } = useAppStore()
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
  useEffect(() => { if (currentUser()) void run(refresh) }, [])
  const openWorkspace = async (workspace: SaaSWorkspace) => {
    await loadScripts()
    await chooseCloudWorkspace(workspace)
    const [people, kit] = await Promise.all([
      accountFetch<{ members: Member[] }>(`/account/workspaces/${workspace.id}/members`),
      readCloudContent<BrandKit>(workspace.id, 'brandkit'),
    ])
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
    setMessage(result.conflicts ? 'Edições simultâneas preservadas como cópias.' : 'Workspace aberto e sincronizado.')
  }
  const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40'
  const field = 'min-h-11 rounded-xl border bg-transparent px-3 text-sm'
  const manager = cloudWorkspace && ['owner', 'admin'].includes(cloudWorkspace.role)
  return <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
    <h1 className="text-2xl font-bold">Equipe e sincronização</h1>
    <p style={{ color: 'var(--muted)' }}>Roteiros, agenda e identidade visual vinculados à sua conta. O plano do proprietário define os recursos da equipe.</p>
    {message ? <p role="status" className="rounded-xl border p-3">{message}</p> : null}
    {!currentUser() ? <button className={button} onClick={requestAccount}>Entrar para acessar a nuvem</button> : <>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void run(async () => { await chooseCloudWorkspace(null); setMembers([]); setMessage('Biblioteca local selecionada.') })}>Usar biblioteca local</button><button className={button} onClick={requestAccount}>Conta e planos</button></div>
      <div className="flex flex-wrap gap-2"><input aria-label="Nome do workspace" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do workspace" /><button className={button} disabled={busy || !name.trim()} onClick={() => void run(async () => { const result = await createCloudWorkspace(name); setName(''); await refresh(); await openWorkspace(result.workspace) })}>Criar workspace</button></div>
      <div className="grid gap-2 sm:grid-cols-2">{account?.workspaces.map((workspace) => <button key={workspace.id} className={`${button} text-left`} disabled={busy} aria-pressed={workspace.id === cloudWorkspace?.id} onClick={() => void run(() => openWorkspace(workspace))}>{workspace.name} · {ROLE_LABEL[workspace.role]}</button>)}</div>
      {cloudWorkspace ? <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">{cloudWorkspace.name}</h2>
        <p>Seu acesso: {ROLE_LABEL[cloudWorkspace.role]}</p>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void run(() => openWorkspace(cloudWorkspace))}>Sincronizar agora</button><button className={button} onClick={() => setView('library')}>Abrir roteiros</button>
        {cloudWorkspace.role !== 'viewer' ? <button className={button} disabled={busy} onClick={() => void run(async () => { const count = await copyLocalScriptsToWorkspace(cloudWorkspace.id); await syncCloudWorkspace(cloudWorkspace.id); await loadScripts(); setMessage(`${count} roteiro(s) copiado(s). Os originais locais foram mantidos.`) })}>Copiar meus roteiros locais</button> : null}</div>
        <ul className="space-y-2">{members.map((member) => <li key={member.id}>{member.name || member.email} · {ROLE_LABEL[member.role]}{!member.acceptedAt ? ' · aguardando e-mail confirmado' : ''}</li>)}</ul>
        {manager ? <>
          <div className="flex flex-wrap gap-2"><input aria-label="E-mail do membro" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do membro" /><select aria-label="Acesso do membro" className={field} value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="editor">Editor</option><option value="viewer">Leitor</option>{cloudWorkspace.role === 'owner' ? <option value="admin">Administrador</option> : null}</select><button className={button} disabled={busy || !email.trim()} onClick={() => void run(async () => { await inviteWorkspaceMember(cloudWorkspace.id, { email, name: email.split('@')[0]!, role }); setEmail(''); await openWorkspace(cloudWorkspace) })}>Convidar</button></div>
          <h3 className="font-bold">Identidade visual compartilhada</h3>
          <label className="block">Nome da marca<input className={`${field} ml-2`} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></label>
          <div className="flex gap-4"><label>Cor principal <input type="color" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} /></label><label>Cor de destaque <input type="color" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} /></label></div>
          <label className="block">Logo da equipe (PNG, JPG ou WebP, até 250 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 250000) { setMessage('Use uma logo de até 250 KB.'); return } const reader = new FileReader(); reader.onload = () => setBrand({ ...brand, logoDataUrl: String(reader.result) }); reader.readAsDataURL(file) }} /></label>
          <button className={button} disabled={busy} onClick={() => void run(async () => { await writeCloudContent(cloudWorkspace.id, 'brandkit', 'brandkit', brand, brandRevision); await openWorkspace(cloudWorkspace); setMessage('Identidade visual salva na equipe.') })}>Salvar identidade visual</button>
        </> : null}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>A agenda sincroniza datas e legendas. Os arquivos de vídeo continuam no aparelho em que foram gravados.</p>
      </section> : null}
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Recuperar roteiros da sincronização antiga</summary><p className="my-3 text-sm">Recupere uma cópia local usando sua frase antiga. Depois selecione um workspace e copie os roteiros para sua conta.</p><input aria-label="Frase-chave antiga" type="password" className={field} value={legacyPass} onChange={(e) => setLegacyPass(e.target.value)} /><button className={`${button} ml-2`} disabled={busy || legacyPass.trim().length < 12} onClick={() => void run(async () => { const rows = await pullFromCloud(legacyPass); let count = 0; for (const row of rows) { if (await db.scripts.where('key').equals(row.key).first()) continue; await db.scripts.add({ ...row, id: undefined }); count++ } setLegacyPass(''); await chooseCloudWorkspace(null); setMessage(`${count} roteiro(s) recuperado(s) na biblioteca local.`) })}>Recuperar cópia local</button></details>
    </>}
  </div>
}
