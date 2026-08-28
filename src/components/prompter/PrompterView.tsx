import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { splitWords } from '../../lib/text'
import { usePrompterEngine } from '../../hooks/usePrompterEngine'
import { useVoiceTrack, type VoiceTrackingMode } from '../../hooks/useVoiceTrack'
import { useGamepad } from '../../hooks/useGamepad'
import { useRecorder, formatElapsed } from '../../hooks/useRecorder'
import { useTranscription } from '../../hooks/useTranscription'
import { buildSrt, type CaptionUtterance } from '../../lib/srt'
import { SRT_LANGUAGES, translateSrt } from '../../lib/translate'
import { isShareCancelled, shareVideo } from '../../lib/share'
import SettingsPanel from './SettingsPanel'
import AspectGuide from './AspectGuide'

const ACTIVE_WORD_CLASS = 'word-active'
const WORD_CLASS = 'prompter-word'

export default function PrompterView() {
  const currentScript = useAppStore((s) => s.currentScript)
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const setView = useAppStore((s) => s.setView)

  const [showSettings, setShowSettings] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const [srtText, setSrtText] = useState<string | null>(null)
  const [transLangIdx, setTransLangIdx] = useState(0)
  const [translatedSrt, setTranslatedSrt] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [transError, setTransError] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [voiceFallback, setVoiceFallback] = useState(false)
  const transAbortRef = useRef<AbortController | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const spacerTopRef = useRef<HTMLDivElement>(null)
  const spacerBottomRef = useRef<HTMLDivElement>(null)
  const spansRef = useRef<(HTMLSpanElement | null)[]>([])
  const offsetsRef = useRef<number[]>([])
  const lineHRef = useRef(0)
  const activeIdxRef = useRef(-1)
  const pausedByVoiceRef = useRef(false)
  const voiceFallbackRef = useRef(false)
  const voiceModeRef = useRef<VoiceTrackingMode>('none')
  const lastPctAtRef = useRef(0)

  const content = currentScript?.content ?? ''

  const words = useMemo(() => splitWords(content), [content])

  const effectiveWpm =
    settings.mode === 'timed'
      ? Math.max(1, Math.round(words.length / Math.max(0.1, settings.targetMinutes)))
      : settings.wpm

  const segments = useMemo(() => {
    const parts = content.split(/(\s+)/)
    const segs: { text: string; wordIndex: number | null }[] = []
    let wi = 0
    for (const part of parts) {
      if (part === '') continue
      if (/\s/.test(part[0]!)) segs.push({ text: part, wordIndex: null })
      else segs.push({ text: part, wordIndex: wi++ })
    }
    return segs
  }, [content])

  const updateActiveWord = useCallback((idx: number) => {
    if (activeIdxRef.current === idx) return
    const prev = activeIdxRef.current
    if (prev >= 0 && spansRef.current[prev]) {
      spansRef.current[prev]!.classList.remove(ACTIVE_WORD_CLASS)
    }
    if (idx >= 0 && spansRef.current[idx]) {
      spansRef.current[idx]!.classList.add(ACTIVE_WORD_CLASS)
    }
    activeIdxRef.current = idx
  }, [])

  const applyFrame = useCallback(
    (fraction: number) => {
      const viewport = viewportRef.current
      const inner = innerRef.current
      if (!viewport || !inner) return
      const offsets = offsetsRef.current
      const n = offsets.length
      if (n === 0) return
      const pos = Math.max(0, Math.min(n - 1, fraction * (n - 1)))
      const idx = Math.floor(pos)
      const t = pos - idx
      const y =
        idx < n - 1 ? offsets[idx]! + (offsets[idx + 1]! - offsets[idx]!) * t : offsets[n - 1]!
      const target = viewport.clientHeight / 2 - (y + lineHRef.current / 2)
      const scale = settings.mirror ? -1 : 1
      inner.style.transform = `translate3d(0, ${target}px, 0) scaleX(${scale})`
      updateActiveWord(settings.highlightWords ? Math.round(pos) : -1)
      const now = performance.now()
      if (now - lastPctAtRef.current > 250 || fraction === 0 || fraction === 1) {
        lastPctAtRef.current = now
        setProgressPct(Math.round(fraction * 100))
      }
    },
    [settings.mirror, settings.highlightWords, updateActiveWord],
  )

  const engine = usePrompterEngine({
    mode: settings.mode,
    wordCount: words.length,
    wpm: effectiveWpm,
    onFrame: applyFrame,
  })
  const startEngine = engine.start

  const statusRef = useRef({ state: engine.state, fraction: 0 })
  statusRef.current = { state: engine.state, fraction: engine.fraction.current }

  useEffect(() => {
    const setPrompterState = useAppStore.getState().setPrompterState
    const id = window.setInterval(() => setPrompterState(statusRef.current), 300)
    setPrompterState(statusRef.current)
    return () => {
      window.clearInterval(id)
      useAppStore.getState().setPrompterState(null)
    }
  }, [])

  useEffect(() => {
    const onSeek = (e: Event) => {
      const f = (e as CustomEvent<number>).detail
      if (typeof f === 'number' && Number.isFinite(f)) engine.seekToFraction(f)
    }
    window.addEventListener('pf-seek', onSeek)
    return () => window.removeEventListener('pf-seek', onSeek)
  }, [engine])

  const handleSpeechActivity = useCallback(
    (active: boolean) => {
      const state = useAppStore.getState()
      if (voiceFallbackRef.current) return
      if (!state.settings.cameraOn && state.settings.mode !== 'voice') return
      if (active) {
        if (voiceModeRef.current === 'audio-level') {
          pausedByVoiceRef.current = false
          engine.start('fixed')
          return
        }
        if (pausedByVoiceRef.current) {
          pausedByVoiceRef.current = false
          engine.start()
        }
      } else if (engine.state === 'running' && state.settings.mode === 'voice') {
        pausedByVoiceRef.current = true
        engine.pause()
      }
    },
    [engine],
  )

  const captionRef = useRef<CaptionUtterance[]>([])
  const recStartRef = useRef(0)

  const pushCaption = useCallback((text: string) => {
    if (!recStartRef.current) return
    captionRef.current.push({ text, at: (performance.now() - recStartRef.current) / 1000 })
  }, [])

  const voice = useVoiceTrack({
    words,
    enabled:
      settings.mode === 'voice' && (engine.state === 'running' || engine.state === 'paused'),
    lang: settings.voiceLang,
    sensitivity: settings.voiceSensitivity,
    onWordMatch: (i) => engine.seekToWord(i),
    onSpeechActivity: handleSpeechActivity,
    onUtterance: (text) => pushCaption(text),
  })

  const recorder = useRecorder()
  const transcription = useTranscription()
  voiceModeRef.current = voice.mode

  useEffect(() => {
    voiceFallbackRef.current = voiceFallback
  }, [voiceFallback])

  useEffect(() => {
    if (settings.mode !== 'voice') {
      setVoiceFallback(false)
      return
    }
    if ((!voice.supported || voice.error) && (engine.state === 'running' || engine.state === 'paused')) {
      pausedByVoiceRef.current = false
      voiceFallbackRef.current = true
      setVoiceFallback(true)
      startEngine('fixed')
    }
  }, [engine.state, settings.mode, startEngine, voice.error, voice.supported])

  const handleShareRecording = async () => {
    if (!recorder.videoBlob || shareBusy) return
    setShareBusy(true)
    setShareMsg(null)
    try {
      const ext = recorder.videoBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const outcome = await shareVideo({
        blob: recorder.videoBlob,
        fileName: `alvoprompter-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`,
        title: currentScript?.title || 'Vídeo do AlvoPrompter',
        text: currentScript?.title,
      })
      setShareMsg(outcome === 'shared'
        ? 'Compartilhamento aberto — escolha Instagram, YouTube, TikTok ou outro app.'
        : 'O vídeo foi baixado. Abra a rede social para publicar.')
    } catch (err) {
      if (!isShareCancelled(err)) setShareMsg((err as Error).message)
    } finally {
      setShareBusy(false)
    }
  }

  const stopRecording = useCallback(() => {
    recorder.stop()
    setSrtText(buildSrt(captionRef.current) || null)
    setShowResult(true)
  }, [recorder])

  const handleTranslate = useCallback(async () => {
    if (!srtText || translating) return
    setTransError(null)
    setTranslatedSrt(null)
    setTranslating(true)
    const controller = new AbortController()
    transAbortRef.current = controller
    try {
      const result = await translateSrt(srtText, SRT_LANGUAGES[transLangIdx]!, {
        signal: controller.signal,
        onToken: (t) => setTranslatedSrt(t),
      })
      setTranslatedSrt(result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTransError((err as Error).message)
    } finally {
      setTranslating(false)
      transAbortRef.current = null
    }
  }, [srtText, translating, transLangIdx])

  useEffect(() => () => transAbortRef.current?.abort(), [])

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    lineHRef.current = settings.fontSize * settings.lineHeight
    const half = viewport.clientHeight / 2
    if (spacerTopRef.current) spacerTopRef.current.style.height = `${half}px`
    if (spacerBottomRef.current) spacerBottomRef.current.style.height = `${half}px`
    const offsets: number[] = []
    for (const s of spansRef.current) {
      if (s) offsets.push(s.offsetTop)
    }
    offsetsRef.current = offsets
  }, [settings.fontSize, settings.lineHeight])

  useLayoutEffect(() => {
    activeIdxRef.current = -1
    measure()
    applyFrame(0)
    const viewport = viewportRef.current
    if (!viewport) return
    const ro = new ResizeObserver(() => {
      measure()
      applyFrame(engine.fraction.current)
    })
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [words, settings.fontSize, settings.lineHeight, settings.letterSpacing, measure, applyFrame, engine.fraction])

  useEffect(() => {
    if (settings.cameraOn) void recorder.enable()
    else recorder.disable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.cameraOn])

  const visibilityActionsRef = useRef({
    isRecording: recorder.isRecording,
    cameraOn: settings.cameraOn,
    stopRecording,
    stopVoice: voice.stop,
    disableRecorder: recorder.disable,
    enableRecorder: recorder.enable,
    pauseEngine: engine.pause,
  })
  visibilityActionsRef.current = {
    isRecording: recorder.isRecording,
    cameraOn: settings.cameraOn,
    stopRecording,
    stopVoice: voice.stop,
    disableRecorder: recorder.disable,
    enableRecorder: recorder.enable,
    pauseEngine: engine.pause,
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      const actions = visibilityActionsRef.current
      if (document.hidden) {
        if (actions.isRecording) actions.stopRecording()
        actions.stopVoice()
        actions.disableRecorder()
        actions.pauseEngine()
        return
      }
      if (actions.cameraOn) void actions.enableRecorder()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (engine.state === 'done' && !settings.openMic && recorder.isRecording) {
      stopRecording()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.state, settings.openMic, recorder.isRecording])

  const { supported: transSupported, start: transStart, stop: transStop } = transcription

  useEffect(() => {
    if (settings.mode === 'voice') return
    if (!recorder.isRecording) {
      transStop()
      return
    }
    if (!transSupported) return
    transStart(settings.voiceLang, (text) => pushCaption(text))
    return () => transStop()
  }, [recorder.isRecording, settings.mode, transSupported, settings.voiceLang, pushCaption, transStart, transStop])

  const handlePrimary = useCallback(() => {
    if (engine.state === 'running') {
      pausedByVoiceRef.current = false
      engine.pause()
      return
    }
    if (engine.state === 'done') {
      engine.stop()
      return
    }
    voice.reset()
    const fallbackToAutomatic = settings.mode === 'voice' && !voice.supported
    pausedByVoiceRef.current = false
    voiceFallbackRef.current = fallbackToAutomatic
    setVoiceFallback(fallbackToAutomatic)
    engine.start(fallbackToAutomatic ? 'fixed' : undefined)
    if (settings.mode === 'voice' && voice.supported) voice.start()
  }, [engine, voice, settings.mode])

  const refs = useRef({ handlePrimary, showSettings, settings, updateSettings, setView })
  refs.current = { handlePrimary, showSettings, settings, updateSettings, setView }

  const engineRef = useRef({ stop: engine.stop, nudge: engine.nudge })
  engineRef.current = { stop: engine.stop, nudge: engine.nudge }

  const gamepadConnected = useGamepad((action) => {
    if (action === 'primary') refs.current.handlePrimary()
    else if (action === 'stop') engineRef.current.stop()
    else if (action === 'nudge-up') engineRef.current.nudge(-0.02)
    else if (action === 'nudge-down') engineRef.current.nudge(0.02)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return
      }
      const { handlePrimary: primary, showSettings: open, settings: s, updateSettings: up, setView: nav } =
        refs.current
      switch (e.key) {
        case ' ':
          e.preventDefault()
          primary()
          break
        case 'Escape':
          if (open) setShowSettings(false)
          else nav('library')
          break
        case 'ArrowUp':
          engine.nudge(-0.02)
          break
        case 'ArrowDown':
          engine.nudge(0.02)
          break
        case 'm':
        case 'M':
          up({ mirror: !s.mirror })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }, [])

  if (!currentScript || words.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg text-white">Este roteiro está vazio.</p>
        <button
          onClick={() => setView('editor')}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
          style={{ background: 'var(--accent)' }}
        >
          Ir para o editor
        </button>
      </div>
    )
  }

  const statusLabel = (() => {
    if (engine.state === 'idle') return 'Pronto'
    if (engine.state === 'done') return 'Concluído'
    if (engine.state === 'paused') {
      return pausedByVoiceRef.current ? 'Pausado · aguardando sua voz' : 'Pausado'
    }
    if (settings.mode === 'voice') {
      if (voiceFallback) return 'Rolando (automático)'
      if (voice.mode === 'audio-level') {
        return voice.listening ? 'Microfone ativo · siga falando' : 'Preparando microfone...'
      }
      return voice.listening ? 'Ouvindo sua voz...' : 'Rolando (voz)'
    }
    if (settings.mode === 'timed') return 'Rolando (tempo-alvo)'
    return 'Rolando'
  })()

  const cameraBlock = settings.cameraOn && (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: '38%' }}
    >
      <video
        ref={recorder.attachVideo}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {recorder.status === 'requesting' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
          Solicitando câmera...
        </div>
      )}
      {recorder.status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm" style={{ background: 'rgba(0,0,0,0.6)', color: 'var(--danger)' }}>
          {recorder.error}
        </div>
      )}
      {settings.eyeContactDot && (
        <div
          className="absolute left-1/2 top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90"
          style={{ background: 'rgba(34,211,238,0.85)', boxShadow: '0 0 10px rgba(0,0,0,0.7)' }}
          title="Ponto de contato visual"
          aria-label="Ponto de contato visual próximo à câmera"
        />
      )}
      <AspectGuide ratio={settings.aspectGuide} dimOutside />
    </div>
  )

  return (
    <div className="flex h-full flex-col" style={{ background: settings.bgColor }}>
      <div
        className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 pb-2 pt-2 sm:px-4"
        style={{ borderColor: 'var(--border)', background: 'rgba(10,12,18,0.94)', paddingTop: 'max(.5rem, env(safe-area-inset-top))' }}
      >
        <button onClick={() => setView('library')} className="grid h-11 w-11 place-items-center rounded-2xl border text-lg font-bold" style={{ borderColor: 'rgba(255,255,255,.28)', color: '#fff', background: 'rgba(255,255,255,.08)' }} aria-label="Sair do prompter">←</button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-white on-dark">{currentScript.title || 'Sem título'}</p>
          <span
            className="mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background:
                engine.state === 'running' ? 'rgba(52,211,153,0.15)' : 'var(--panel)',
              color: engine.state === 'running' ? 'var(--ok)' : 'var(--muted)',
              border: '1px solid rgba(255,255,255,.24)',
            }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="grid h-11 w-11 place-items-center rounded-2xl border text-lg font-bold"
            style={{ borderColor: 'rgba(255,255,255,.28)', color: '#fff', background: 'rgba(255,255,255,.08)' }}
            aria-label="Alternar tela cheia"
          >
            ⛶
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="grid h-11 w-11 place-items-center rounded-2xl border text-lg font-bold"
            style={{ borderColor: 'rgba(255,255,255,.32)', color: '#fff', background: 'rgba(255,255,255,.12)' }}
            aria-label="Abrir ajustes do prompter"
          >
            ⚙
          </button>
        </div>
      </div>

      {settings.mode === 'voice' && (!voice.supported || voice.error) ? (
        <div className="border-b px-3 py-2 text-center text-xs" style={{ borderColor: 'var(--border)', background: 'rgba(251,191,36,.12)', color: 'var(--warn)' }} role="status">
          {voice.error
            ? `${voice.error} A rolagem automática foi ativada.`
            : 'Rolagem por voz indisponível neste aparelho. A velocidade automática será usada.'}
        </div>
      ) : null}

      {settings.mode === 'voice' && voice.supported && !voice.error && voice.mode === 'audio-level' ? (
        <div className="border-b px-3 py-2 text-center text-xs" style={{ borderColor: 'rgba(34,211,238,.3)', background: 'rgba(34,211,238,.1)', color: '#a5f3fc' }} role="status">
          Modo compatível com Android: o texto avança enquanto o microfone detecta sua fala e pausa no silêncio.
        </div>
      ) : null}

      {settings.cameraPosition === 'top' && cameraBlock}

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 h-px"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        />
        <div
          ref={innerRef}
          className="absolute left-0 top-0 w-full will-change-transform"
          style={{ transform: 'translate3d(0, 50vh, 0)' }}
        >
          <div ref={spacerTopRef} />
          <div
            dir={settings.rtl ? 'rtl' : 'ltr'}
            style={{
              padding: '0 max(2rem, 8vw)',
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              letterSpacing: settings.letterSpacing,
              fontFamily: settings.fontFamily,
              color: settings.fontColor,
              whiteSpace: 'pre-wrap',
              direction: settings.rtl ? 'rtl' : 'ltr',
            }}
          >
            {segments.map((seg, i) =>
              seg.wordIndex == null ? (
                seg.text
              ) : (
                <span
                  key={i}
                  ref={(el) => {
                    spansRef.current[seg.wordIndex!] = el
                  }}
                  className={WORD_CLASS}
                >
                  {seg.text}
                </span>
              ),
            )}
          </div>
          <div ref={spacerBottomRef} />
        </div>
        {!settings.cameraOn && <AspectGuide ratio={settings.aspectGuide} dimOutside={false} />}
      </div>

      {settings.cameraPosition === 'bottom' && cameraBlock}

      <div
        className="border-t px-3 pb-3 pt-2 sm:px-4"
        style={{ borderColor: 'var(--border)', background: 'rgba(10,12,18,0.94)', paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-2 flex max-w-4xl items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>{progressPct}%</span>
        </div>
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 sm:gap-3">
          <button
            onClick={engine.stop}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-lg"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            aria-label="Reiniciar roteiro"
          >
            ⟲
          </button>
          <button
            onClick={handlePrimary}
            className="min-h-14 min-w-0 flex-1 rounded-2xl px-5 text-base font-bold sm:max-w-xs"
            style={{ background: engine.state === 'running' ? 'var(--warn)' : 'var(--brand-gradient)', color: engine.state === 'running' ? '#151927' : '#fff' }}
          >
            {engine.state === 'running' ? '❚❚ Pausar' : '▶ Iniciar'}
          </button>
          {gamepadConnected && (
            <span className="hidden rounded-full border px-2 py-1 text-[11px] sm:inline" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              🎮 pedal ativo
            </span>
          )}
          {settings.cameraOn && (
            <button
              onClick={() => {
                if (recorder.isRecording) {
                  stopRecording()
                } else {
                  recStartRef.current = performance.now()
                  captionRef.current = []
                  setSrtText(null)
                  setShowResult(false)
                  recorder.start()
                }
              }}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold"
              style={{
                borderColor: recorder.isRecording ? 'var(--danger)' : 'var(--border)',
                color: recorder.isRecording ? 'var(--danger)' : 'var(--text)',
              }}
            >
              {recorder.isRecording ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--danger)' }} />
                  Gravando {formatElapsed(recorder.elapsed)}
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--danger)' }} />
                  <span className="hidden min-[390px]:inline">Gravar</span>
                </>
              )}
            </button>
          )}
        </div>
        <p className="mt-2 hidden text-center text-[11px] sm:block" style={{ color: 'var(--muted)' }}>
          Espaço: iniciar/pausar · ↑↓: ajustar posição · M: espelhar · Esc: sair
          {gamepadConnected && ' · Pedal: ▶=botão 1 · ⟲=botão 2 · ↑↓=botões 3/4'}
        </p>
      </div>

      {showSettings && (
        <SettingsPanel settings={settings} wordCount={words.length} onClose={() => setShowSettings(false)} />
      )}

      {showResult && recorder.videoUrl && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-6">
          <div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-2xl sm:rounded-2xl sm:pb-5"
            style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
          >
            <h3 className="mb-3 font-semibold text-white on-dark">Gravação concluída</h3>
            <video src={recorder.videoUrl} controls className="mb-4 w-full rounded-lg" />
            {srtText && (
              <div
                className="mb-4 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Legenda automática gerada
                  </p>
                  <button
                    onClick={() => {
                      const blob = new Blob([srtText], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `alvoprompter-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.srt`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="rounded-lg px-3 py-1 text-xs font-semibold text-black"
                    style={{ background: 'var(--accent)' }}
                  >
                    Baixar legenda (.srt)
                  </button>
                </div>
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-white on-dark">
                  {srtText}
                </pre>
              </div>
            )}
            {srtText && (
              <div
                className="mb-4 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Traduzir legenda
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={transLangIdx}
                      onChange={(e) => {
                        setTransLangIdx(Number(e.target.value))
                        setTranslatedSrt(null)
                      }}
                      className="rounded-lg border bg-transparent px-2 py-1 text-xs text-white on-dark"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {SRT_LANGUAGES.map((l, i) => (
                        <option key={l.code} value={i} style={{ background: 'var(--panel)' }}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    {translating ? (
                      <button
                        onClick={() => transAbortRef.current?.abort()}
                        className="rounded-lg border px-3 py-1 text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        Cancelar
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleTranslate()}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-black"
                        style={{ background: 'var(--accent-2)', color: '#0e0a1a' }}
                      >
                        ✨ Traduzir
                      </button>
                    )}
                  </div>
                </div>
                {transError && (
                  <p className="mb-2 rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                    {transError}
                  </p>
                )}
                {translatedSrt && (
                  <>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-white on-dark">
                      {translatedSrt}
                    </pre>
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => {
                          const blob = new Blob([translatedSrt], { type: 'text/plain' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `alvoprompter-${SRT_LANGUAGES[transLangIdx]!.code}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.srt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="rounded-lg px-3 py-1 text-xs font-semibold text-black"
                        style={{ background: 'var(--accent)' }}
                      >
                        Baixar traduzido ({SRT_LANGUAGES[transLangIdx]!.code})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {shareMsg && (
              <p className="mb-3 text-right text-xs" style={{ color: 'var(--muted)' }}>{shareMsg}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setShowResult(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Continuar
              </button>
              <button
                onClick={() => {
                  if (!recorder.videoBlob || !recorder.videoUrl) return
                  useAppStore.getState().setRecording({
                    blob: recorder.videoBlob,
                    url: recorder.videoUrl,
                    srt: srtText,
                    utterances: captionRef.current.slice(),
                  })
                  setShowResult(false)
                  setView('video-editor')
                }}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: 'var(--accent-2)', color: 'var(--accent-2)' }}
              >
                🎬 Editar vídeo
              </button>
              <button
                onClick={() => void handleShareRecording()}
                disabled={!recorder.videoBlob || shareBusy}
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {shareBusy ? 'Preparando…' : '↗ Compartilhar'}
              </button>
              <a
                href={recorder.videoUrl}
                download={`alvoprompter-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
                style={{ background: 'var(--accent)' }}
              >
                Baixar vídeo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
