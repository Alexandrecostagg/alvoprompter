import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getVideoProject, listVideoProjects, mediaScope, updateVideoProject, type VideoProjectSummary } from '../../lib/videoProjects'

export default function VideoProjects() {
  const owner = useAppStore(s => s.mediaOwner)
  const workspace = useAppStore(s => s.cloudWorkspace?.id ?? null)
  const scope = mediaScope(owner, workspace)
  const [items, setItems] = useState<VideoProjectSummary[]>([])
  const [trash, setTrash] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setItems([])
    void listVideoProjects(scope, trash).then(rows => { if (live) setItems(rows) }).catch(() => { if (live) setError('Não foi possível abrir as gravações salvas. Tente novamente.') })
    return () => { live = false }
  }, [scope, trash, revision])
  const open = async (item: VideoProjectSummary) => {
    try {
      const project = await getVideoProject(item.id, scope)
      const store = useAppStore.getState()
      if (mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== scope) return
      if (!project) throw new Error('Gravação indisponível')
      store.selectScript(store.scripts.find(s => s.key === project.scriptKey) ?? null)
      store.setRecording({ blob: project.blob, url: '', srt: project.srt, utterances: project.utterances, project })
      store.setView('video-editor')
    } catch { setError('Não foi possível recuperar esta gravação. Tente novamente.') }
  }
  return <section className="my-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }} aria-label="Gravações salvas">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{trash ? 'Lixeira de gravações' : 'Suas gravações'}</h2><p className="text-sm" style={{ color: 'var(--muted)' }}>Tomadas e edições salvas neste aparelho.</p></div>
      <button className="min-h-11 rounded-xl border px-3 text-sm" onClick={() => { setTrash(!trash); setError(null) }}>{trash ? 'Ver gravações' : 'Ver lixeira'}</button>
    </div>
    {error && <div role="alert" className="my-3"><p>{error}</p><button onClick={() => { setError(null); setRevision(r => r + 1) }} className="min-h-11 underline">Tentar novamente</button></div>}
    {!items.length && !error && <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>{trash ? 'Nenhuma gravação na lixeira.' : 'Depois de gravar, você poderá retomar sua edição por aqui.'}</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.id} className="min-w-0 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
      <h3 className="truncate font-semibold">{item.title}</h3>
      <p className="my-2 text-sm" style={{ color: 'var(--muted)' }}>Tomada de {new Date(item.createdAt).toLocaleString('pt-BR')}<br />{item.exportState === 'ready' ? 'Versão exportada disponível' : item.exportState === 'rendering' ? 'Exportação interrompida · retome a edição' : 'Edição recuperável'}</p>
      <div className="flex flex-wrap gap-2">{trash ? <button className="min-h-11 rounded-lg border px-3" onClick={() => void updateVideoProject(item.id, scope, { deletedAt: undefined }).then(() => setRevision(r => r + 1)).catch(() => setError('Não foi possível restaurar. Tente novamente.'))}>Restaurar gravação</button> : <button onClick={() => void open(item)} className="min-h-11 rounded-lg px-4 font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>Retomar edição</button>}</div>
    </article>)}</div>
  </section>
}
