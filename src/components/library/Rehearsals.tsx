import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import RehearsalAudioPlayer from './RehearsalAudioPlayer'
import { listRehearsalAudios, type RehearsalAudio, listRehearsals, saveRehearsal, type Rehearsal } from '../../lib/rehearsals'
import { mediaScope } from '../../lib/videoProjects'
import { newScriptKey } from '../../lib/db'

export default function Rehearsals() {
  const owner = useAppStore(s => s.mediaOwner)
  const workspace = useAppStore(s => s.cloudWorkspace?.id ?? null)
  const scope = mediaScope(owner, workspace)
  const [audios, setAudios] = useState<RehearsalAudio[]>([])
  const [items, setItems] = useState<Rehearsal[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { let live = true; setItems([]); setAudios([]); setError(null); void Promise.all([listRehearsals(scope), listRehearsalAudios(scope)]).then(([rows, recordings]) => { if (live) { setItems(rows); setAudios(recordings) } }).catch(() => { if (live) setError('Não foi possível abrir os ensaios salvos.') }); return () => { live = false } }, [scope])
  const open = async (source: Rehearsal | RehearsalAudio) => {
    const session: Rehearsal = { ...source, updatedAt: Date.now() }
    const store = useAppStore.getState()
    if (mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== session.scope) return
    const original = store.scripts.find(s => s.key === session.scriptKey && s.content === session.content)
    const now = Date.now()
    const script = original ?? { key: newScriptKey(), title: `${session.title} · ensaio salvo`, content: session.content, createdAt: now, updatedAt: now, ...(workspace ? { cloudWorkspaceId: workspace } : {}) }
    if (!original) { await store.upsertScript(script); await saveRehearsal({ ...session, scriptKey: script.key! }) }
    if (mediaScope(useAppStore.getState().mediaOwner, useAppStore.getState().cloudWorkspace?.id ?? null) !== scope) return
    store.selectScript(script)
    store.setView('prompter')
  }
  if (!items.length && !audios.length && !error) return null
  return <section className="my-5 rounded-2xl border p-4" aria-label="Ensaios salvos" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
    <h2 className="text-lg font-semibold">Seus ensaios</h2>
    <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Roteiro, ajustes, ponto de leitura e áudios guardados neste aparelho. Salve uma cópia dos áudios que quiser levar para outro dispositivo.</p>
    {error && <p role="alert">{error}</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.scriptKey} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <h3 className="truncate font-semibold">{item.title}</h3><p className="my-2 text-sm">{item.fraction >= 1 ? 'Leitura concluída' : `${Math.round(item.fraction * 100)}% do roteiro`} · {new Date(item.updatedAt).toLocaleString('pt-BR')}</p>
      <button className="min-h-11 rounded-xl border px-3 text-sm font-semibold" onClick={() => void open(item).catch(() => setError('Não foi possível recuperar o ensaio. Tente novamente.'))}>Abrir ensaio salvo</button>
    </article>)}</div>
    {audios.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{audios.map(item => <article key={item.id} className="min-w-0 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <h3 className="truncate font-semibold">{item.title} · áudio</h3>
      <p className="mt-1 text-sm">{Math.floor(item.duration / 60)}:{Math.floor(item.duration % 60).toString().padStart(2, '0')} · {new Date(item.createdAt).toLocaleString('pt-BR')}</p>
      <RehearsalAudioPlayer item={item} />
      <button className="mt-2 min-h-11 rounded-xl border px-3 text-sm font-semibold" onClick={() => void (async () => { await saveRehearsal({ ...item, updatedAt: Date.now() }); await open(item) })().catch(() => setError('Não foi possível recuperar este ensaio.'))}>Retomar roteiro deste áudio</button>
    </article>)}</div>}
  </section>
}
