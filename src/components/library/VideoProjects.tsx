import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getVideoProject, getVideoVersion, listVideoVersions, listVideoProjects, mediaScope, updateVideoProject, type VideoProjectSummary } from '../../lib/videoProjects'
import { saveRehearsal } from '../../lib/rehearsals'
import { recoverNativeTakes } from '../../lib/capture/recovery'
import SavedVideoPreview, { type SavedVideo } from './SavedVideoPreview'
import { newScriptKey } from '../../lib/db'

export default function VideoProjects() {
  const owner = useAppStore(s => s.mediaOwner)
  const workspace = useAppStore(s => s.cloudWorkspace?.id ?? null)
  const scope = mediaScope(owner, workspace)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<SavedVideo | null>(null)
  const [opening, setOpening] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'ready'>('all')
  const [items, setItems] = useState<VideoProjectSummary[]>([])
  const [trash, setTrash] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setLoading(true); setItems([]); setPreview(null); setError(null)
    void (async () => {
      try {
        const result = await recoverNativeTakes(scope)
        if (live && result.failed) setError('Há tomadas interrompidas que ainda não puderam ser recuperadas. Os originais continuam guardados. Tente novamente.')
      } catch { if (live) setError('Não foi possível conferir as tomadas interrompidas. Seus vídeos já salvos continuam abaixo.') }
      const rows = await listVideoProjects(scope, trash)
      if (live) setItems(rows)
    })().catch(() => { if (live) setError('Não foi possível abrir as gravações salvas. Tente novamente.') }).finally(() => { if (live) setLoading(false) })
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
  const watch = async (item: VideoProjectSummary, kind: 'original' | 'final') => {
    setOpening(true); setError(null)
    try {
      const versions = kind === 'final' ? await listVideoVersions(item.id, scope) : []
      const source = kind === 'final' ? (versions[0] ? await getVideoVersion(versions[0].id, scope) : undefined) : await getVideoProject(item.id, scope)
      const state = useAppStore.getState()
      if (mediaScope(state.mediaOwner, state.cloudWorkspace?.id ?? null) !== scope) return
      if (!source) throw new Error('Esta versão não está disponível. Abra a edição para conferir suas versões salvas.')
      setPreview({ blob: source.blob, title: item.title, kind })
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível abrir o vídeo.') }
    finally { setOpening(false) }
  }
  const continueScript = async (item: VideoProjectSummary) => {
    try {
      const store = useAppStore.getState()
      if (!item.scriptContent || mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== scope) return
      const original = store.scripts.find(s => s.key === item.scriptKey && s.content === item.scriptContent)
      const now = Date.now()
      const script = original ?? { key: newScriptKey(), title: `${item.title} · continuação`, content: item.scriptContent, createdAt: now, updatedAt: now, ...(workspace ? { cloudWorkspaceId: workspace } : {}) }
      if (!original) await store.upsertScript(script)
      await saveRehearsal({ scope, scriptKey: script.key!, title: script.title, content: script.content, settings: store.settings, fraction: item.resumeFraction ?? 0, updatedAt: now })
      if (mediaScope(useAppStore.getState().mediaOwner, useAppStore.getState().cloudWorkspace?.id ?? null) !== scope) return
      store.selectScript(script); store.setView('prompter')
    } catch { setError('Não foi possível preparar a continuação. A tomada anterior continua salva.') }
  }
  const visibleItems = items.filter(item => trash || filter === 'all' || (filter === 'ready' ? item.exportState === 'ready' : item.exportState !== 'ready'))
  return <section className="my-6 rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }} aria-label="Gravações salvas">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">{trash ? 'Lixeira de gravações' : 'Seus vídeos'}</h2><p className="text-sm" style={{ color: 'var(--muted)' }}>Tomadas e edições salvas neste aparelho.</p></div>
      <button className="min-h-11 rounded-xl border px-3 text-sm" onClick={() => { setTrash(!trash); setError(null) }}>{trash ? 'Ver gravações' : 'Ver lixeira'}</button>
    </div>
    {!trash && <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar vídeos">{([{ id: 'all', label: 'Todos' }, { id: 'pending', label: 'Aguardando edição' }, { id: 'ready', label: 'Com versão final' }] as const).map(tab => <button key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className="min-h-11 rounded-xl border px-3 text-sm" style={{ background: filter === tab.id ? 'var(--accent-soft)' : undefined }}>{tab.label}</button>)}</div>}
    {opening && <p role="status" className="mt-3 text-sm">Abrindo vídeo salvo…</p>}
    {error && <div role="alert" className="my-3"><p>{error}</p><button onClick={() => { setError(null); setRevision(r => r + 1) }} className="min-h-11 underline">Tentar novamente</button></div>}
    {loading && <p role="status" className="mt-4 text-sm">Abrindo vídeos salvos…</p>}
    {!loading && !items.length && !error && <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>{trash ? 'Nenhuma gravação na lixeira.' : 'Depois de gravar, você poderá retomar sua edição por aqui.'}</p>}
    {!loading && items.length > 0 && !visibleItems.length && <p className="mt-4 text-sm">{filter === 'ready' ? 'Nenhuma versão final nesta lista. Abra uma edição e aplique seus ajustes para gerar o vídeo final.' : 'Nenhum vídeo aguardando edição. Suas versões prontas estão em Com versão final.'}</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{visibleItems.map(item => <article key={item.id} className="min-w-0 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
      <h3 className="truncate font-semibold">{item.title}</h3>
      <p className="my-2 text-sm" style={{ color: 'var(--muted)' }}>Tomada de {new Date(item.createdAt).toLocaleString('pt-BR')}<br />{item.exportState === 'ready' ? 'Versão final salva · pronta para assistir e compartilhar' : item.exportState === 'rendering' ? 'Exportação interrompida · retome a edição' : 'Aguardando edição · original salvo'}</p>
      {item.captureWarning && <p className="my-2 text-sm" role="status" style={{ color: 'var(--danger)' }}>{item.captureWarning}</p>}
      {item.resumeFraction != null && item.resumeFraction < 1 && <p className="mb-2 text-xs">Tomada parcial · {Math.round(item.resumeFraction * 100)}% do roteiro. Você pode aproveitar qualquer trecho.</p>}
      <div className="flex flex-wrap gap-2">{trash ? <button className="min-h-11 rounded-lg border px-3" onClick={() => void updateVideoProject(item.id, scope, { deletedAt: undefined }).then(() => setRevision(r => r + 1)).catch(() => setError('Não foi possível restaurar. Tente novamente.'))}>Restaurar gravação</button> : <><button onClick={() => void open(item)} className="min-h-11 rounded-lg px-4 font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>Continuar edição</button><button disabled={opening} className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void watch(item, 'original')}>Ver original</button>{item.exportState === 'ready' && <button disabled={opening} className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void watch(item, 'final')}>Ver vídeo final / salvar</button>}{item.scriptContent && (item.resumeFraction ?? 1) < 1 && <button className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => void continueScript(item)}>Continuar roteiro em nova tomada</button>}</>}</div>
      {!trash && item.scriptContent && (item.resumeFraction ?? 1) < 1 && <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>A continuação guarda uma nova tomada; esta gravação permanece intacta.</p>}
    </article>)}</div>
    {preview && <SavedVideoPreview video={preview} onClose={() => setPreview(null)} />}
  </section>
}
