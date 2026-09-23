import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { syncCloudWorkspace } from '../lib/cloudSync'
import { currentUser, requestAccount } from '../lib/auth'

export default function SyncControl() {
  const workspace = useAppStore((s) => s.cloudWorkspace)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const synchronize = async () => {
    if (!workspace || busy) return
    setBusy(true)
    try {
      await useAppStore.getState().loadScripts()
      const result = await syncCloudWorkspace(workspace.id)
      await useAppStore.getState().loadScripts()
      setMessage(result.conflicts ? 'Edições simultâneas preservadas como cópias.' : 'Sincronizado com sua conta.')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="relative">
    <button className="min-h-10 rounded-xl border px-3 text-sm" style={{ borderColor: 'var(--border)' }} disabled={busy} onClick={() => {
      if (!currentUser()) { requestAccount(); return }
      if (!workspace) { useAppStore.getState().setView('workspaces'); return }
      void synchronize()
    }}>{busy ? 'Sincronizando…' : 'Sincronizar'}</button>
    {message ? <div role="status" className="absolute right-0 top-12 z-50 w-72 rounded-xl border p-3 text-xs" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>{message}<button aria-label="Fechar mensagem de sincronização" className="ml-2" onClick={() => setMessage('')}>×</button></div> : null}
  </div>
}
