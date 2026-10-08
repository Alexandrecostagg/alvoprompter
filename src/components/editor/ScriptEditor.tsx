import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { estimateDurationMinutes, wordCount } from '../../lib/text'
import { formatElapsed } from '../../hooks/useRecorder'
import { IMPORTABLE_EXT, extractTextFromFile, fileNameFromImport } from '../../lib/importers'
import { readAloud } from '../../lib/readAloud'
import EditorToolDialog from './EditorToolDialog'
import { trackEvent } from '../../lib/stats'
import AiPanel from '../ai/AiPanel'
import ScriptAnalysis from './ScriptAnalysis'

const SPEEDS = [100, 130, 150, 180, 200]

export default function ScriptEditor() {
  const { currentScript, upsertScript, setView, settings, updateSettings, cloudWorkspace, saveStatus, saveError, aiPanelTab, openAiPanel, closeAiPanel } =
    useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const stopReading = useRef<(() => void) | null>(null)
  const dirty = saveStatus !== 'saved'
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showTiming, setShowTiming] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [ttsBusy, setTtsBusy] = useState(false)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [speechMessage, setSpeechMessage] = useState<string | null>(null)

  useEffect(() => {
    setTtsBusy(false)
    setTtsPlaying(false)
    setSpeechMessage(null)
    return () => { stopReading.current?.(); stopReading.current = null }
  }, [currentScript?.id, currentScript?.content])


  useEffect(() => {
    if (aiPanelTab == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAiPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aiPanelTab, closeAiPanel])

  if (!currentScript) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <p style={{ color: 'var(--muted)' }}>Nenhum roteiro selecionado.</p>
        <button
          onClick={() => setView('library')}
          className="mt-4 rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Voltar para a biblioteca
        </button>
      </div>
    )
  }

  const words = wordCount(currentScript.content)
  const effectiveWpm = settings.mode === 'timed'
    ? Math.max(1, Math.round(words / Math.max(0.1, settings.targetMinutes)))
    : settings.wpm
  const minutes = estimateDurationMinutes(words, effectiveWpm)

  const handleSave = async () => {
    if (!currentScript || cloudWorkspace?.role === 'viewer') return
    await upsertScript(currentScript)
    trackEvent('script_saved')
  }

  const importFile = async (file: File) => {
    try {
      const content = await extractTextFromFile(file)
      const next = { ...currentScript, title: fileNameFromImport(file.name) || currentScript.title, content }
      useAppStore.getState().selectScript(next)
    } catch (err) {
      window.alert(`Não foi possível importar o arquivo: ${(err as Error).message}`)
    }
  }

  const toggleDubbing = () => {
    if (ttsPlaying || ttsBusy) {
      stopReading.current?.()
      stopReading.current = null
      setTtsPlaying(false)
      setTtsBusy(false)
      setSpeechMessage(null)
      return
    }
    if (!currentScript.content.trim()) return
    setTtsBusy(true)
    setSpeechMessage(null)
    try {
      stopReading.current = readAloud(currentScript.content, {
        onStart: () => { setTtsBusy(false); setTtsPlaying(true) },
        onEnd: () => { setTtsBusy(false); setTtsPlaying(false) },
        onError: (message) => { setTtsBusy(false); setTtsPlaying(false); setSpeechMessage(message) },
      })
    } catch (err) {
      setTtsBusy(false)
      setSpeechMessage((err as Error).message)
    }
  }

  return (
    <div className="script-workspace mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b px-4 pb-3 backdrop-blur-xl sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-3" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg) 92%, transparent)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('library')} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-lg" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} aria-label="Voltar para a biblioteca">←</button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">Preparar roteiro</p><p className="text-[11px]" style={{ color: dirty ? 'var(--warn)' : 'var(--muted)' }}>{saveError ?? (saveStatus === 'saving' || saveStatus === 'pending' ? 'Salvando automaticamente…' : saveStatus === 'error' ? 'Falha ao salvar' : 'Salvo neste dispositivo')}</p></div>
          <button onClick={() => void handleSave().catch(() => undefined)} disabled={!dirty || saveStatus === 'saving'} className="min-h-11 rounded-2xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: dirty ? 'var(--warn)' : 'var(--border)', color: dirty ? 'var(--warn)' : 'var(--muted)' }}>{dirty ? 'Salvar' : 'Salvo'}</button>
          <button onClick={() => void handleSave().then(() => setView('prompter')).catch(() => undefined)} disabled={words === 0} className="min-h-11 rounded-2xl px-3 text-sm font-bold text-white disabled:opacity-40 sm:px-4" style={{ background: 'var(--brand-gradient)' }}>Gravar →</button>
        </div>
        <ol className="creation-steps" aria-label="Etapas de criação">
          <li aria-current="step"><span>1</span>Preparar</li><li><span>2</span>Gravar</li><li><span>3</span>Finalizar</li>
        </ol>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:justify-end">
          <button onClick={toggleDubbing} disabled={words === 0} aria-pressed={ttsPlaying || ttsBusy} className="min-h-11 rounded-xl border px-2 text-xs font-semibold sm:px-3 sm:text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: ttsPlaying || ttsBusy ? 'var(--accent-soft)' : 'var(--panel)' }}>{ttsBusy ? 'Cancelar leitura' : ttsPlaying ? 'Parar leitura' : 'Ouvir texto'}</button>
          <button
            onClick={() => openAiPanel(aiPanelTab ?? 'generate')}
            disabled={cloudWorkspace?.role === 'viewer'}
            className="min-h-10 rounded-xl px-2 text-xs font-semibold sm:px-3 sm:text-sm"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--brand-strong)',
            }}
          >
            Gerar com IA
          </button>
          <button onClick={() => setShowTools((value) => !value)} aria-expanded={showTools} aria-controls="script-extra-tools" className="min-h-10 rounded-xl border px-2 text-xs font-semibold sm:px-3 sm:text-sm" style={{ borderColor: showTools ? 'var(--brand-strong)' : 'var(--border)', color: showTools ? 'var(--brand-strong)' : 'var(--text)' }}>{showTools ? 'Fechar ajustes' : 'Mais ajustes'}</button>
        </div>
        {showTools ? <div id="script-extra-tools" className="mt-2 grid grid-cols-3 gap-2 rounded-2xl border p-2" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={cloudWorkspace?.role === 'viewer'}
            className="min-h-10 rounded-xl border px-2 text-xs font-semibold sm:px-3 sm:text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Importar
          </button>
          <button
            onClick={() => { setShowTiming(false); setShowAnalysis(true) }}
            aria-haspopup="dialog"
            className="min-h-11 rounded-xl px-2 text-xs font-semibold"
            style={{
              background: showAnalysis ? 'var(--accent-soft)' : 'var(--bg)',
              color: showAnalysis ? 'var(--accent)' : 'var(--text)',
            }}
          >
            Analisar texto
          </button>
          <button aria-haspopup="dialog" onClick={() => { setShowAnalysis(false); setShowTiming(true) }} className="min-h-11 rounded-xl px-2 text-xs font-semibold" style={{ background: showTiming ? 'var(--accent-soft)' : 'var(--bg)', color: showTiming ? 'var(--accent)' : 'var(--text)' }}>Ajustar ritmo</button>
        </div> : null}
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
        {speechMessage && <p role="alert" className="mt-2 rounded-xl border p-3 text-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{speechMessage}</p>}
        {(ttsPlaying || ttsBusy) && <p role="status" className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>{ttsBusy ? 'Iniciando a voz do aparelho…' : 'Lendo com a voz do aparelho. Toque em Parar leitura para encerrar.'}</p>}

      </div>

      <div className="script-intro"><div><p className="studio-eyebrow">ENCONTRE AS SUAS PALAVRAS</p><h1>Uma boa conversa começa aqui.</h1></div><span>{formatElapsed(minutes * 60)}<small>tempo estimado</small></span></div>
      <section className="script-paper" aria-label="Seu roteiro">
      <label htmlFor="script-title" className="script-field-label">Título do roteiro</label>
      <input
        id="script-title"
        readOnly={cloudWorkspace?.role === 'viewer'}
        value={currentScript.title}
        lang="pt-BR"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        onChange={(e) => {
          useAppStore.getState().selectScript({ ...currentScript, title: e.target.value })
            }}
        placeholder="Título do roteiro"
        className="mb-3 min-h-[3.25rem] w-full rounded-2xl border bg-transparent px-4 py-3 text-lg font-semibold outline-none focus:ring-2"
        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
      />

      <label htmlFor="script-content" className="script-field-label script-content-label">O que você quer contar?</label>
      <textarea
        id="script-content"
        readOnly={cloudWorkspace?.role === 'viewer'}
        value={currentScript.content}
        lang="pt-BR"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        onChange={(e) => {
          useAppStore.getState().selectScript({ ...currentScript, content: e.target.value })
            }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            void handleSave().catch(() => undefined)
          }
        }}
        placeholder="Escreva como você fala. Comece pela ideia principal, desenvolva em frases curtas e termine com um convite. Você também pode colar um texto ou gerar um rascunho com IA."
        className="min-h-[55dvh] w-full flex-1 resize-none rounded-2xl border p-4 text-base leading-relaxed outline-none focus:ring-2 sm:min-h-[50vh]"
        style={{ borderColor: 'var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
      />

      </section>

      <div className="mt-3 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ color: 'var(--muted)' }}>
        <span>
          {words} palavras · duração estimada ~{formatElapsed(minutes * 60)} a {effectiveWpm} palavras/min
        </span>
        <span>Dica: use parágrafos curtos para a rolagem por voz acompanhar melhor.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Velocidade
        </p>
        <div className="flex flex-wrap gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => updateSettings({ wpm: s, mode: 'fixed' })}
              className="rounded-full border px-3 py-1.5 text-[11px] font-semibold tabular-nums transition-colors"
              style={
                settings.mode === 'fixed' && s === settings.wpm
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'black' }
                  : { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--ink-soft)' }
              }
              title="Clique para definir esta velocidade"
            >
              {s} wpm · {formatElapsed(estimateDurationMinutes(words, s) * 60)}
            </button>
          ))}
        </div>
      </div>

      {showTiming && <EditorToolDialog title="Ajustar ritmo" onClose={() => setShowTiming(false)}>
        <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>Escolha a velocidade de leitura ou uma duração para o vídeo. O ajuste será usado ao abrir Gravar.</p>
        <p className="mb-2 font-semibold">Velocidade de leitura</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SPEEDS.map((speed) => <button key={speed} aria-pressed={settings.mode === 'fixed' && settings.wpm === speed}
            onClick={() => updateSettings({ wpm: speed, mode: 'fixed' })}
            className="min-h-11 rounded-xl border px-3 text-sm" style={{ borderColor: 'var(--border)', background: settings.mode === 'fixed' && settings.wpm === speed ? 'var(--accent-soft)' : 'var(--bg)' }}>
            <span className="block font-semibold">{speed} palavras/min</span>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>≈ {formatElapsed(estimateDurationMinutes(words, speed) * 60)}</span>
          </button>)}
        </div>
        <p className="mb-2 mt-5 font-semibold">Duração desejada</p>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 5].map((duration) => <button key={duration} disabled={words === 0} aria-pressed={settings.mode === 'timed' && settings.targetMinutes === duration}
            onClick={() => updateSettings({ targetMinutes: duration, mode: 'timed' })}
            className="min-h-11 rounded-xl border px-3 text-sm disabled:opacity-40" style={{ borderColor: 'var(--border)', background: settings.mode === 'timed' && settings.targetMinutes === duration ? 'var(--accent-soft)' : 'var(--bg)' }}>
            <span className="block font-semibold">{duration} min</span>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>≈{Math.max(1, Math.round(words / duration))} palavras/min</span>
          </button>)}
        </div>
        <p role="status" className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'var(--accent-soft)' }}>
          {settings.mode === 'timed' ? `Tempo-alvo definido: ${settings.targetMinutes} min.` : `Velocidade definida: ${settings.wpm} palavras por minuto.`}
        </p>
        <button onClick={() => setShowTiming(false)} className="mt-4 min-h-11 w-full rounded-xl px-4 font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>Concluir</button>
      </EditorToolDialog>}

      {showAnalysis && (
        <EditorToolDialog title="Analisar texto" onClose={() => setShowAnalysis(false)}>
        <ScriptAnalysis
          content={currentScript.content}
          wpm={effectiveWpm}
          onApplyClean={(text) => {
            useAppStore.getState().selectScript({ ...currentScript, content: text })
                }}
          onClose={() => setShowAnalysis(false)}
        />
        </EditorToolDialog>
      )}

      {aiPanelTab != null && <AiPanel tab={aiPanelTab} />}
    </div>
  )
}
