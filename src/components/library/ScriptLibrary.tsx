import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { estimateDurationMinutes, wordCount } from '../../lib/text'
import { formatElapsed } from '../../hooks/useRecorder'
import { IMPORTABLE_EXT, extractTextFromFile, extractTextFromUrl, fileNameFromImport } from '../../lib/importers'
import { transcribeAudio } from '../../lib/cloudflare'
import type { Script } from '../../lib/types'

type LibraryIconName = 'document' | 'sparkles' | 'import' | 'play' | 'search' | 'text' | 'clock'

function LibraryIcon({ name, className = 'h-5 w-5' }: { name: LibraryIconName; className?: string }) {
  const paths = {
    document: <><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></>,
    import: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    play: <path d="m9 7 8 5-8 5V7Z" />,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    text: <><path d="M4 6h16M4 10h16M4 14h10M4 18h7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  } satisfies Record<LibraryIconName, ReactNode>
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} d`
}

export default function ScriptLibrary() {
  const { scripts, currentScript, loading, loadError, removeScript, selectScript, setView, settings, openAiPanel } =
    useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const [showLinkImport, setShowLinkImport] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [audioBusy, setAudioBusy] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const [query, setQuery] = useState('')

  const visibleScripts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return scripts
    return scripts.filter((script) => `${script.title} ${script.content}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [query, scripts])

  const createNew = () => {
    if (useAppStore.getState().cloudWorkspace?.role === 'viewer') return
    selectScript({ title: 'Novo roteiro', content: '', createdAt: Date.now(), updatedAt: Date.now() })
    setView('editor')
  }

  const createWithAi = () => {
    if (useAppStore.getState().cloudWorkspace?.role === 'viewer') return
    selectScript({
      title: 'Roteiro com IA',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    openAiPanel('generate')
    setView('editor')
  }

  const openImported = (title: string, content: string) => {
    selectScript({ title, content, createdAt: Date.now(), updatedAt: Date.now() })
    setView('editor')
  }

  const importFile = async (file: File) => {
    try {
      const content = await extractTextFromFile(file)
      openImported(fileNameFromImport(file.name) || 'Importado', content)
    } catch (err) {
      setLinkError((err as Error).message)
      setShowLinkImport(true)
    }
  }

  const importLink = async () => {
    if (!linkUrl.trim() || linkBusy) return
    setLinkBusy(true)
    setLinkError(null)
    try {
      const content = await extractTextFromUrl(linkUrl.trim())
      openImported('Importado de link', content)
      setShowLinkImport(false)
      setLinkUrl('')
    } catch (err) {
      setLinkError((err as Error).message)
    } finally {
      setLinkBusy(false)
    }
  }

  const importAudio = async (file: File) => {
    if (audioBusy) return
    setAudioBusy(true)
    setLinkError(null)
    try {
      const lang = (settings.voiceLang || 'pt-BR').split('-')[0] || 'pt'
      const result = await transcribeAudio(file, lang)
      if (!result.text?.trim()) throw new Error('A transcrição ficou vazia — verifique se há fala no áudio.')
      openImported(fileNameFromImport(file.name) || 'Transcrito', result.text.trim())
    } catch (err) {
      setLinkError((err as Error).message)
      setShowLinkImport(true)
    } finally {
      setAudioBusy(false)
    }
  }

  const openPrompter = (script: Script) => {
    selectScript(script)
    setView('prompter')
  }

  const scriptChip = (script: Script) => {
    const isAi = script.title?.toLocaleLowerCase('pt-BR').includes('roteiro com ia')
    return isAi
      ? { label: 'IA', style: { background: 'var(--accent-soft)', color: 'var(--brand-strong)' } }
      : { label: 'Roteiro', style: { background: '#e5f6f1', color: 'var(--ok)' } }
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--brand-strong)' }}>{useAppStore.getState().cloudWorkspace?.name ?? 'Neste dispositivo'}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Seus roteiros</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{scripts.length ? `${scripts.length} roteiro${scripts.length === 1 ? '' : 's'} · escolha um para continuar` : 'Do seu texto ao próximo vídeo.'}</p>
        </div>
        <button disabled={useAppStore.getState().cloudWorkspace?.role === 'viewer'} onClick={createNew} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white" style={{ background: 'var(--brand-gradient)' }}>＋ Novo</button>
      </div>

      <div className="library-actions mb-5 grid grid-cols-3 gap-2 sm:gap-3" aria-label="Criar ou importar roteiro">
        <button disabled={useAppStore.getState().cloudWorkspace?.role === 'viewer'} onClick={createWithAi} className="group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl text-white shadow-lg" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', boxShadow: '0 8px 18px rgba(128,82,255,.32)' }}><LibraryIcon name="sparkles" /></span>
          <strong className="block text-sm">Gerar com IA</strong>
          <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Conte o tema e receba um roteiro pronto no seu tom.</span>
        </button>
        <button disabled={useAppStore.getState().cloudWorkspace?.role === 'viewer'} onClick={createNew} className="group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}><LibraryIcon name="document" /></span>
          <strong className="block text-sm">Novo roteiro</strong>
          <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Comece do zero e escreva direto no editor.</span>
        </button>
        <button disabled={useAppStore.getState().cloudWorkspace?.role === 'viewer'} onClick={() => { setLinkError(null); setShowImportMenu(true) }} className="group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl" style={{ background: '#e5f6f1', color: 'var(--ok)' }}><LibraryIcon name="import" /></span>
          <strong className="block text-sm">{audioBusy ? 'Importando…' : 'Importar'}</strong>
          <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Arquivo, áudio (transcrição) ou link da web.</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={IMPORTABLE_EXT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }}
        />
        <input
          ref={audioRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importAudio(file)
            e.target.value = ''
          }}
        />
      </div>

      {currentScript?.content.trim() ? (
        <button onClick={() => setView('editor')} className="mb-5 flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: 'var(--border)', background: 'var(--accent-soft)' }}>
          <span className="min-w-0"><span className="block text-xs font-semibold" style={{ color: 'var(--brand-strong)' }}>Continuar de onde parou</span><strong className="mt-1 block truncate text-sm">{currentScript.title || 'Sem título'}</strong></span>
          <span aria-hidden="true">→</span>
        </button>
      ) : null}

      {scripts.length > 0 ? (
        <label className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border px-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <span style={{ color: 'var(--muted)' }}><LibraryIcon name="search" /></span>
          <span className="sr-only">Buscar roteiros</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título ou conteúdo"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text)' }}
          />
          {query ? <button type="button" onClick={() => setQuery('')} className="grid h-8 w-8 place-items-center rounded-full" style={{ color: 'var(--muted)', background: 'var(--bg)' }} aria-label="Limpar busca">×</button> : null}
        </label>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border p-4 text-sm" role="alert" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--panel)' }}>
          {loadError} Recarregue o aplicativo e tente novamente.
        </div>
      ) : loading ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Carregando...
        </p>
      ) : scripts.length === 0 ? (
        <div
          className="rounded-3xl border border-dashed p-6 text-center sm:p-8"
          style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
        >
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}><LibraryIcon name="document" /></div>
          <p className="mt-4 font-bold">Nenhum roteiro ainda</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
            Use uma das três opções acima para começar. Você poderá revisar tudo antes de abrir o prompter.
          </p>
        </div>
      ) : visibleScripts.length === 0 ? (
        <div className="rounded-3xl border p-8 text-center" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <p className="font-bold">Nenhum roteiro encontrado</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Tente outro termo ou limpe a busca.</p>
          <button onClick={() => setQuery('')} className="mt-4 min-h-11 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Limpar busca</button>
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleScripts.map((script) => {
            const words = wordCount(script.content)
            const minutes = estimateDurationMinutes(words, settings.wpm)
            return (
              <li
                key={script.id}
                className="group relative flex items-center gap-3 rounded-3xl border p-3.5 transition-colors sm:p-4"
                style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}
              >
                <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-2xl sm:grid" style={{ background: 'linear-gradient(135deg, var(--accent-soft), #ffecc9)', color: 'var(--brand-strong)' }} aria-hidden="true"><LibraryIcon name="document" className="h-5 w-5" /></span>
                <button
                  onClick={() => {
                    selectScript(script)
                    setView('editor')
                  }}
                  className="min-w-0 flex-1 rounded-2xl px-1 py-1 text-left"
                >
                  <p className="truncate font-semibold">{script.title || 'Sem título'}</p>
                  <p className="mt-1 truncate text-xs" style={{ color: 'var(--muted)' }}>
                    {words} palavras · ~{formatElapsed(minutes * 60)} ·{' '}
                    {relativeTime(script.updatedAt)}
                  </p>
                </button>
                <span className="hidden shrink-0 rounded-full sm:inline px-2.5 py-1 text-[11px] font-bold" style={scriptChip(script).style}>{scriptChip(script).label}</span>
                <button disabled={!script.content.trim()} onClick={() => openPrompter(script)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg" style={{ background: 'var(--brand-gradient)', boxShadow: '0 10px 24px rgba(99,102,241,.22)' }} aria-label={`Abrir “${script.title || 'Sem título'}” no prompter`}>▶</button>
                <details className="relative shrink-0">
                  <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-xl text-xl" style={{ color: 'var(--muted)' }} aria-label={`Mais opções para “${script.title || 'Sem título'}”`}>⋮</summary>
                  <div className="absolute right-0 top-12 z-20 w-40 rounded-2xl border p-1.5 shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
                    <button onClick={() => { selectScript(script); setView('editor') }} className="min-h-10 w-full rounded-xl px-3 text-left text-sm font-medium hover:opacity-80">Editar roteiro</button>
                    <button disabled={useAppStore.getState().cloudWorkspace?.role === 'viewer'} onClick={() => { if (script.id != null && window.confirm(`Excluir “${script.title || 'Sem título'}”?`)) void removeScript(script.id) }} className="min-h-10 w-full rounded-xl px-3 text-left text-sm font-medium" style={{ color: 'var(--danger)' }}>Excluir</button>
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      {showImportMenu && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center sm:p-6">
          <button className="absolute inset-0" onClick={() => setShowImportMenu(false)} aria-label="Fechar opções de importação" />
          <section className="relative w-full rounded-t-[2rem] border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-3xl" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }} role="dialog" aria-modal="true" aria-label="Importar roteiro">
            <span className="mx-auto mb-4 block h-1 w-12 rounded-full sm:hidden" style={{ background: 'var(--border)' }} aria-hidden="true" />
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">Importar roteiro</h3><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Escolha de onde vem o conteúdo.</p></div><button onClick={() => setShowImportMenu(false)} className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--bg)', color: 'var(--muted)' }} aria-label="Fechar">×</button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button onClick={() => { setShowImportMenu(false); fileRef.current?.click() }} className="flex min-h-20 items-center gap-3 rounded-2xl border px-4 text-left sm:flex-col sm:justify-center sm:text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}><span className="text-xl" aria-hidden="true">▤</span><span><strong className="block text-sm">Arquivo</strong><small style={{ color: 'var(--muted)' }}>.txt, .docx ou PDF</small></span></button>
              <button onClick={() => { setShowImportMenu(false); audioRef.current?.click() }} disabled={audioBusy} className="flex min-h-20 items-center gap-3 rounded-2xl border px-4 text-left disabled:opacity-50 sm:flex-col sm:justify-center sm:text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}><span className="text-xl" aria-hidden="true">◉</span><span><strong className="block text-sm">Áudio</strong><small style={{ color: 'var(--muted)' }}>Transcrever uma fala</small></span></button>
              <button onClick={() => { setShowImportMenu(false); setShowLinkImport(true) }} className="flex min-h-20 items-center gap-3 rounded-2xl border px-4 text-left sm:flex-col sm:justify-center sm:text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}><span className="text-xl" aria-hidden="true">↗</span><span><strong className="block text-sm">Link</strong><small style={{ color: 'var(--muted)' }}>YouTube ou página</small></span></button>
            </div>
          </section>
        </div>
      )}

      {showLinkImport && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/80 sm:items-center sm:justify-center sm:p-6">
          <div
            className="w-full rounded-t-[2rem] border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl"
            style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
          >
            <h3 className="mb-1 font-semibold">Importar de link</h3>
            <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
              Cole uma URL pública. YouTube (transcrição via legendas), Google Docs e qualquer
              página com texto são suportados pela API AlvoPrompter.
            </p>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void importLink()
                if (e.key === 'Escape') setShowLinkImport(false)
              }}
              placeholder="https://exemplo.com/roteiro"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border)' }}
            />
            {linkError && (
              <p className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                {linkError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowLinkImport(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void importLink()}
                disabled={!linkUrl.trim() || linkBusy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {linkBusy ? 'Buscando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
