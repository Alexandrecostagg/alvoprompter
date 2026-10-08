import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  ROLE_LABEL,
  ROLE_ORDER,
  addMember,
  canManage,
  listWorkspaces,
  newWorkspace,
  removeMember,
  removeWorkspace,
  setMember,
  syncWorkspaces,
  upsertWorkspace,
} from '../../lib/workspace'
import { clearSyncPass, saveSyncPass, savedSyncPass } from '../../lib/syncWorker'
import type { TeamRole, Workspace, WorkspaceMember } from '../../lib/types'

function logoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não consegui ler o logo.'))
    reader.readAsDataURL(file)
  })
}

export default function WorkspacesPanel() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const refreshWorkspaces = useAppStore((s) => s.refreshWorkspaces)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [pass, setPass] = useState('')
  const [syncOpen, setSyncOpen] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const connected = (savedSyncPass()?.length ?? 0) >= 12

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  const refresh = async () => {
    await refreshWorkspaces()
    setWorkspaces(await listWorkspaces())
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async () => {
    if (!newName.trim()) {
      setMsg({ type: 'err', text: 'Dê um nome ao workspace.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await upsertWorkspace(newWorkspace(newName.trim()))
      setNewName('')
      setCreating(false)
      await refresh()
      const ws = await listWorkspaces()
      const created = ws[0]!
      if (created.id != null) setActiveWorkspace(created.id)
      setMsg({ type: 'ok', text: 'Workspace criado!' })
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const setLogo = async (file: File) => {
    if (!active) return
    setBusy(true)
    try {
      const dataUrl = await logoToDataUrl(file)
      await upsertWorkspace({
        ...active,
        brandKit: { ...(active.brandKit ?? { name: active.name, primaryColor: '#8B5CF6', accentColor: '#22D3EE' }), logoDataUrl: dataUrl },
      })
      await refresh()
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const updateBrand = async (patch: Partial<NonNullable<Workspace['brandKit']>>) => {
    if (!active) return
    const base = active.brandKit ?? { name: active.name, primaryColor: '#8B5CF6', accentColor: '#22D3EE' }
    await upsertWorkspace({ ...active, brandKit: { ...base, ...patch } })
    await refresh()
  }

  const updateMember = async (index: number, member: WorkspaceMember) => {
    if (!active) return
    await setMember(active, index, member)
    await refresh()
  }

  const addMemberForm = async (name: string, email: string, role: TeamRole) => {
    if (!active || !name.trim()) return
    await addMember(active, { name: name.trim(), email: email.trim() || undefined, role })
    await refresh()
  }

  const delWorkspace = async (ws: Workspace) => {
    if (!window.confirm(`Apagar o workspace "${ws.name}"?`)) return
    if (ws.id != null) await removeWorkspace(ws.id)
    await refresh()
  }

  const runSync = async () => {
    const p = savedSyncPass() ?? pass
    if (!p || p.trim().length < 12) {
      setMsg({ type: 'err', text: 'Use uma frase-chave com pelo menos 12 caracteres.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      saveSyncPass(p)
      const r = await syncWorkspaces(p.trim())
      await refresh()
      setMsg({ type: 'ok', text: `Sincronizado: ${r.added} novo(s).` })
      setSyncOpen(false)
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Workspaces</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Workspace local (legado): brand kits e lista de colaboradores por frase-chave. Contas e RBAC ficam em “Conta”.{' '}
            {connected && '☁️ sync ativo.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSyncOpen((v) => !v)}
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            ☁️ {connected ? 'sync' : 'Sincronizar'}
          </button>
          <button
            onClick={() => {
              setCreating(true)
              setNewName('')
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-black transition-colors"
            style={{ background: 'var(--accent)' }}
          >
            + Novo workspace
          </button>
        </div>
      </div>

      {syncOpen && (
        <div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {connected
              ? 'Workspaces sincronizados entre aparelhos da mesma conta e frase-chave.'
              : 'Entre na mesma conta nos seus aparelhos para sincronizar. Para compartilhar com outras pessoas, use a equipe na nuvem.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSync()
              }}
              placeholder="Frase-chave da equipe"
              minLength={12}
              className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', minWidth: 180 }}
            />
            <button
              onClick={() => void runSync()}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
            {connected && (
              <button
                onClick={() => {
                  clearSyncPass()
                  setSyncOpen(false)
                  setMsg(null)
                }}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                Sair
              </button>
            )}
          </div>
        </div>
      )}

      {creating && (
        <div className="mb-8 rounded-xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <h2 className="mb-3 text-lg font-semibold text-white">Novo workspace</h2>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create()
            }}
            placeholder="Nome da equipe / marca"
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void create()}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              Criar
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.type === 'err' ? 'var(--danger)' : 'var(--ok)' }}>
          {msg.text}
        </p>
      )}

      <div className="space-y-4">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          const manage = canManage(ws)
          return (
            <div
              key={ws.id ?? ws.key}
              className="rounded-xl border p-4"
              style={{
                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                background: 'var(--panel)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {ws.brandKit?.logoDataUrl ? (
                    <img
                      src={ws.brandKit.logoDataUrl}
                      alt={ws.name}
                      className="h-10 w-10 rounded-lg object-contain"
                      style={{ background: 'var(--bg)' }}
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${ws.brandKit?.primaryColor ?? '#8B5CF6'}, ${ws.brandKit?.accentColor ?? '#22D3EE'})` }}
                    >
                      {ws.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{ws.name}</h3>
                      <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ color: 'var(--muted)', background: 'var(--bg)' }}>
                        seu papel: {ROLE_LABEL[ws.myRole]}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {ws.members.length} membro{ws.members.length === 1 ? '' : 's'}
                      {ws.brandKit ? ` · marca: ${ws.brandKit.name}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => ws.id != null && setActiveWorkspace(isActive ? null : ws.id)}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {isActive ? '✓ Ativo' : 'Usar'}
                  </button>
                  <button
                    onClick={() => void delWorkspace(ws)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {isActive && (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="mb-2 text-sm font-semibold text-white">Brand kit</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>
                          Nome da marca
                        </label>
                        <input
                          value={ws.brandKit?.name ?? ''}
                          onChange={(e) => void updateBrand({ name: e.target.value })}
                          className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none"
                          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>
                            Cor primária
                          </label>
                          <input
                            type="color"
                            value={ws.brandKit?.primaryColor ?? '#8B5CF6'}
                            onChange={(e) => void updateBrand({ primaryColor: e.target.value })}
                            className="h-8 w-14 cursor-pointer rounded border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>
                            Cor de destaque
                          </label>
                          <input
                            type="color"
                            value={ws.brandKit?.accentColor ?? '#22D3EE'}
                            onChange={(e) => void updateBrand({ accentColor: e.target.value })}
                            className="h-8 w-14 cursor-pointer rounded border"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                          />
                        </div>
                      </div>
                      <div>
                        <input
                          ref={logoRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void setLogo(f)
                          }}
                        />
                        <button
                          onClick={() => logoRef.current?.click()}
                          className="rounded-lg border px-3 py-1.5 text-xs"
                          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                        >
                          {ws.brandKit?.logoDataUrl ? 'Trocar logo' : 'Upload logo'}
                        </button>
                        {ws.brandKit?.logoDataUrl && (
                          <button
                            onClick={() => void updateBrand({ logoDataUrl: undefined })}
                            className="ml-2 rounded-lg border px-3 py-1.5 text-xs"
                            style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                        O logo e as cores do workspace são usados de padrão no editor de vídeo
                        (sobreposição de logo e intro/outro).
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <h4 className="mb-2 text-sm font-semibold text-white">Equipe</h4>
                    <div className="space-y-2">
                      {ws.members.map((m, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg p-1.5" style={{ background: 'var(--bg)' }}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm" style={{ color: 'var(--text)' }}>
                              {m.name}
                              {m.email ? <span className="text-xs" style={{ color: 'var(--muted)' }}> · {m.email}</span> : null}
                            </p>
                          </div>
                          {manage && m.role !== 'owner' ? (
                            <>
                              <select
                                value={m.role}
                                onChange={(e) => void updateMember(i, { ...m, role: e.target.value as TeamRole })}
                                className="rounded border bg-transparent px-2 py-1 text-xs outline-none"
                                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                              >
                                {ROLE_ORDER.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABEL[r]}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => void removeMember(ws, i)}
                                className="text-xs"
                                style={{ color: 'var(--danger)' }}
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>
                              {ROLE_LABEL[m.role]}
                            </span>
                          )}
                        </div>
                      ))}
                      {manage && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <input
                            id={`member-name-${ws.id}`}
                            placeholder="Nome"
                            className="flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-xs outline-none"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                          />
                          <input
                            id={`member-email-${ws.id}`}
                            placeholder="e-mail"
                            className="flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-xs outline-none"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                          />
                          <button
                            onClick={() => {
                              const nameInput = document.getElementById(`member-name-${ws.id}`) as HTMLInputElement | null
                              const emailInput = document.getElementById(`member-email-${ws.id}`) as HTMLInputElement | null
                              void addMemberForm(nameInput?.value ?? '', emailInput?.value ?? '', 'editor')
                              if (nameInput) nameInput.value = ''
                              if (emailInput) emailInput.value = ''
                            }}
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                          >
                            + Adicionar
                          </button>
                        </div>
                      )}
                      {!manage && (
                        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          Só {ROLE_LABEL.owner}/{ROLE_LABEL.admin} podem gerenciar a equipe.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!workspaces.length && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="text-3xl">👥</div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nenhum workspace ainda. Crie um para montar a marca e a equipe.
          </p>
          <button
            onClick={() => {
              setCreating(true)
              setNewName('')
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
            style={{ background: 'var(--accent)' }}
          >
            + Criar workspace
          </button>
        </div>
      )}
    </div>
  )
}
