import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { groupUtterances, formatSrtTime, type SrtSegment } from '../../lib/srt'
import { findFillers } from '../../lib/text'
import { autoCutRanges, detectSpeechRanges, estimateWordTimings, totalRangesDuration } from '../../lib/cuts'
import { computeFacePath, cropCenteredOnFace, faceTrackingSupported, type FaceSample } from '../../lib/faceTrack'
import { parseClipPrompt, type ClipPromptResult } from '../../lib/clipPrompt'
import { generateAvatar } from '../../lib/cloudflare'
import { MUSIC_LIBRARY, generateMusicTrack, type MusicTrack } from '../../lib/music'
import { trackEvent } from '../../lib/stats'
import { createVideoPage, videoPageShareUrl } from '../../lib/videopage'
import { isShareCancelled, shareVideo } from '../../lib/share'
import {
  CAPTION_THEMES,
  computeCrop,
  renderVideo,
  MOTION_PRESETS,
  type CaptionThemeKey,
  type LogoPosition,
  type MotionPreset,
} from '../../lib/video/render'

type AspectOption = 'original' | '9:16' | '1:1' | '16:9'

const ASPECT_OPTIONS: { value: AspectOption; label: string; w?: number; h?: number }[] = [
  { value: 'original', label: 'Original' },
  { value: '9:16', label: '9:16', w: 1080, h: 1920 },
  { value: '1:1', label: '1:1', w: 1080, h: 1080 },
  { value: '16:9', label: '16:9', w: 1920, h: 1080 },
]

function fmt(seg: SrtSegment): string {
  return `${formatSrtTime(seg.start)} – ${formatSrtTime(seg.end)}`
}

export default function VideoEditor() {
  const recording = useAppStore((s) => s.recording)
  const currentScript = useAppStore((s) => s.currentScript)
  const setRecording = useAppStore((s) => s.setRecording)
  const setView = useAppStore((s) => s.setView)

  const [meta, setMeta] = useState<{ w: number; h: number; dur: number } | null>(null)
  const [aspect, setAspect] = useState<AspectOption>('9:16')
  const [burnCaptions, setBurnCaptions] = useState(true)
  const [highlightWords, setHighlightWords] = useState(true)
  const [themeKey, setThemeKey] = useState<CaptionThemeKey>('cinema')
  const [segments, setSegments] = useState<SrtSegment[]>([])
  const [keepMask, setKeepMask] = useState<boolean[]>([])

  const [autoCut, setAutoCut] = useState(false)
  const [autoCutMin, setAutoCutMin] = useState(400)
  const [autoCutPad, setAutoCutPad] = useState(60)
  const [cutSource, setCutSource] = useState<'transcription' | 'audio'>('transcription')
  const [audioThresholdDb, setAudioThresholdDb] = useState(-35)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioRanges, setAudioRanges] = useState<{ start: number; end: number }[]>([])

  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [logoPosition, setLogoPosition] = useState<LogoPosition>('top-left')
  const [logoWidth, setLogoWidth] = useState(15)
  const [music, setMusic] = useState<AudioBuffer | null>(null)
  const [musicVolume, setMusicVolume] = useState(0.3)
  const [musicTrackId, setMusicTrackId] = useState<string | null>(null)
  const [musicBusy, setMusicBusy] = useState<string | null>(null)
  const musicCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const musicPreviewRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)
  const logoFileRef = useRef<HTMLInputElement>(null)
  const musicFileRef = useRef<HTMLInputElement>(null)

  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [motion, setMotion] = useState<MotionPreset>('none')
  const [chromaEnabled, setChromaEnabled] = useState(false)
  const [chromaColor, setChromaColor] = useState('#00b140')
  const [chromaSimilarity, setChromaSimilarity] = useState(45)
  const [chromaSmoothness, setChromaSmoothness] = useState(30)
  const [chromaBg, setChromaBg] = useState('#ffffff')

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outUrl, setOutUrl] = useState<string | null>(null)
  const [outBlob, setOutBlob] = useState<Blob | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [pageBusy, setPageBusy] = useState(false)
  const [pageMsg, setPageMsg] = useState<string | null>(null)
  const [reframe, setReframe] = useState(false)
  const [eyeContact, setEyeContact] = useState(false)
  const facePathRef = useRef<FaceSample[] | null>(null)
  const [promptText, setPromptText] = useState('')
  const [introEnabled, setIntroEnabled] = useState(false)
  const [introText, setIntroText] = useState('')
  const [introSeconds, setIntroSeconds] = useState(3)
  const [outroEnabled, setOutroEnabled] = useState(false)
  const [outroText, setOutroText] = useState('')
  const [outroSeconds, setOutroSeconds] = useState(3)
  const [brandFrom, setBrandFrom] = useState(() => localStorage.getItem('ap.brandFrom') ?? '#8B5CF6')
  const [brandTo, setBrandTo] = useState(() => localStorage.getItem('ap.brandTo') ?? '#22D3EE')

  useEffect(() => {
    localStorage.setItem('ap.brandFrom', brandFrom)
    localStorage.setItem('ap.brandTo', brandTo)
  }, [brandFrom, brandTo])
  const [shorts, setShorts] = useState<{ url: string; start: number; end: number }[]>([])
  const [shortsProgress, setShortsProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const metaVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => () => stopMusicPreview(), [])

  useEffect(() => {
    if (!recording) return
    const v = metaVideoRef.current
    if (!v) return
    v.src = recording.url
    const onLoaded = () => {
      setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration || 0 })
      if (recording.utterances?.length) {
        const segs = groupUtterances(recording.utterances)
        setSegments(segs)
        setKeepMask(segs.map(() => true))
      }
    }
    v.addEventListener('loadedmetadata', onLoaded)
    return () => v.removeEventListener('loadedmetadata', onLoaded)
  }, [recording])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (outUrl) URL.revokeObjectURL(outUrl)
    },
    [outUrl],
  )

  useEffect(
    () => () => {
      setShorts((list) => {
        list.forEach((s) => URL.revokeObjectURL(s.url))
        return []
      })
    },
    [],
  )

  const promptResults = useMemo<ClipPromptResult[]>(
    () => (promptText.trim().length > 2 ? parseClipPrompt(promptText) : []),
    [promptText],
  )

  const words = useMemo(() => estimateWordTimings(recording?.utterances ?? []), [recording])
  const src = cutSource === 'transcription' && words.length === 0 ? 'audio' : cutSource
  const autoRanges = useMemo(
    () =>
      autoCut
        ? autoCutRanges(words, { minSilence: autoCutMin / 1000, pad: autoCutPad / 1000 })
        : [],
    [autoCut, words, autoCutMin, autoCutPad],
  )

  useEffect(() => {
    if (src !== 'audio' || !autoCut || !recording) {
      setAudioBuffer(null)
      setAudioRanges([])
      setAudioError(null)
      return
    }
    let cancelled = false
    const ctx = new OfflineAudioContext(1, 1, 44100)
    void (async () => {
      try {
        const buf = await ctx.decodeAudioData(await recording.blob.arrayBuffer())
        if (!cancelled) {
          setAudioBuffer(buf)
          setAudioError(null)
        }
      } catch {
        if (!cancelled) setAudioError('Não foi possível ler o áudio desta gravação para o corte automático.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recording, src, autoCut])

  useEffect(() => {
    if (!audioBuffer) return
    setAudioRanges(
      detectSpeechRanges(audioBuffer, {
        minSilence: autoCutMin / 1000,
        pad: autoCutPad / 1000,
        thresholdDb: audioThresholdDb,
      }),
    )
  }, [audioBuffer, autoCutMin, autoCutPad, audioThresholdDb])

  const autoBefore = meta?.dur ?? 0
  const activeRanges = src === 'audio' ? audioRanges : autoRanges
  const autoAfter = totalRangesDuration(activeRanges)
  const autoRemoved = Math.max(0, autoBefore - autoAfter)

  if (!recording) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-4 py-8 sm:px-6">
        <p style={{ color: 'var(--muted)' }}>Nenhuma gravação para editar.</p>
        <button
          onClick={() => setView('prompter')}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Voltar ao prompter
        </button>
      </div>
    )
  }

  const previewAspect =
    aspect === 'original'
      ? meta
        ? meta.w / meta.h
        : 1
      : (ASPECT_OPTIONS.find((a) => a.value === aspect)!.w! / ASPECT_OPTIONS.find((a) => a.value === aspect)!.h!)

  const toggleSegment = (idx: number) => {
    setKeepMask((m) => m.map((v, i) => (i === idx ? !v : v)))
  }

  const selectFillers = () => {
    setKeepMask(segments.map((s) => findFillers(s.text).length === 0))
  }

  const keptRanges = segments.filter((_, i) => keepMask[i] ?? true)
  const cutCount = segments.length - keptRanges.length

  const handleLogoFile = (file: File) => {
    const img = new Image()
    img.onload = () => setLogo(img)
    img.src = URL.createObjectURL(file)
  }

  const handleMusicFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const ac = new AudioContext()
      const audioBuffer = await ac.decodeAudioData(buffer)
      void ac.close()
      stopMusicPreview()
      setMusic(audioBuffer)
      setMusicTrackId(null)
    } catch {
      setError('Não foi possível decodificar o arquivo de áudio.')
    }
  }

  const stopMusicPreview = () => {
    musicPreviewRef.current?.src.stop()
    void musicPreviewRef.current?.ctx.close()
    musicPreviewRef.current = null
  }

  const loadTrack = async (track: MusicTrack) => {
    let buf = musicCacheRef.current.get(track.id)
    if (!buf) {
      setMusicBusy(track.id)
      try {
        buf = await generateMusicTrack(track)
        musicCacheRef.current.set(track.id, buf)
      } finally {
        setMusicBusy(null)
      }
    }
    return buf
  }

  const handleUseTrack = async (track: MusicTrack) => {
    try {
      const buf = await loadTrack(track)
      if (!buf) return
      stopMusicPreview()
      setMusic(buf)
      setMusicTrackId(track.id)
    } catch {
      setError('Não foi possível gerar a trilha de fundo.')
    }
  }

  const handlePreviewTrack = async (track: MusicTrack) => {
    if (musicBusy) return
    try {
      const buf = await loadTrack(track)
      if (!buf) return
      stopMusicPreview()
      const ac = new AudioContext()
      const src = ac.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = ac.createGain()
      gain.gain.value = 0.5
      src.connect(gain)
      gain.connect(ac.destination)
      src.start()
      musicPreviewRef.current = { ctx: ac, src }
    } catch {
      setError('Não foi possível gerar a trilha de fundo.')
    }
  }

  const handleAvatar = async () => {
    if (!avatarPrompt.trim() || avatarBusy) return
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      const blob = await generateAvatar(avatarPrompt.trim())
      const url = URL.createObjectURL(blob)
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
      setAvatarPreview(url)
    } catch (err) {
      setAvatarError((err as Error).message)
    } finally {
      setAvatarBusy(false)
    }
  }

  const applyAvatarAsLogo = async () => {
    if (!avatarPreview) return
    const img = new Image()
    img.onload = () => setLogo(img)
    img.src = avatarPreview
  }

  const downloadAvatar = () => {
    if (!avatarPreview) return
    const a = document.createElement('a')
    a.href = avatarPreview
    a.download = 'alvoprompter-avatar.png'
    a.click()
  }

  const ensureFacePath = async (signal?: AbortSignal) => {
    if (!reframe || !recording) return null
    if (!facePathRef.current) {
      try {
        facePathRef.current = await computeFacePath(recording.blob, 1, signal, (done, total) =>
          setProgress(0.4 * (done / total)),
        )
      } catch {
        setReframe(false)
        return null
      }
    }
    return facePathRef.current
  }

  const handleProcess = async () => {
    if (!recording || !meta || processing) return
    setError(null)
    setOutUrl(null)
    setOutBlob(null)
    setShareMsg(null)
    setProgress(0)
    const target = ASPECT_OPTIONS.find((a) => a.value === aspect)!
    const targetW = target.w ?? meta.w
    const targetH = target.h ?? meta.h
    const crop =
      aspect === 'original'
        ? { sx: 0, sy: 0, sw: meta.w, sh: meta.h }
        : computeCrop(meta.w, meta.h, targetW, targetH)
    const ranges = autoCut && activeRanges.length
      ? activeRanges.map((r) => ({ start: r.start, end: Math.min(r.end, meta.dur) }))
      : keptRanges.length
        ? keptRanges.map((s) => ({ start: s.start, end: s.end }))
        : [{ start: 0, end: meta.dur }]
    const cues = burnCaptions
      ? (autoCut ? segments : keptRanges).map((s) => ({ start: s.start, end: s.end, text: s.text }))
      : []

    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    try {
      const facePath = await ensureFacePath(controller.signal)
      const cropAt =
        facePath && aspect !== 'original'
          ? (t: number) => cropCenteredOnFace(facePath, t, meta.w, meta.h, targetW, targetH, eyeContact)
          : undefined
      const blob = await renderVideo({
        sourceBlob: recording.blob,
        targetWidth: targetW,
        targetHeight: targetH,
        crop,
        cropAt,
        keepRanges: ranges,
        captions: cues,
        theme: CAPTION_THEMES.find((t) => t.key === themeKey) ?? CAPTION_THEMES[0]!,
        highlightWords,
        intro: introEnabled && introText.trim()
          ? { text: introText.trim(), seconds: introSeconds }
          : undefined,
        outro: outroEnabled && outroText.trim()
          ? { text: outroText.trim(), seconds: outroSeconds }
          : undefined,
        logo: logo
          ? { image: logo, position: logoPosition, widthPct: logoWidth, opacity: 0.9 }
          : undefined,
        music: music ? { buffer: music, volume: musicVolume } : undefined,
        motion,
        chroma: chromaEnabled
          ? {
              color: chromaColor,
              similarity: chromaSimilarity,
              smoothness: chromaSmoothness,
              bgColor: chromaBg,
            }
          : undefined,
        brandGradient: [brandFrom, brandTo],
        onProgress: (p) => setProgress(0.4 + 0.6 * p),
        signal: controller.signal,
      })
      const url = URL.createObjectURL(blob)
      if (outUrl) URL.revokeObjectURL(outUrl)
      setOutUrl(url)
      setOutBlob(blob)
      setProgress(1)
      trackEvent('video_exported')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setProcessing(false)
      abortRef.current = null
    }
  }

  const handleCreateVideoPage = async () => {
    if (!outBlob || pageBusy) return
    setPageBusy(true)
    setPageMsg(null)
    try {
      const title =
        introEnabled && introText.trim()
          ? introText.trim()
          : currentScript?.title || 'Meu vídeo no AlvoPrompter'
      const page = await createVideoPage({
        blob: outBlob,
        fileName: `alvoprompter-${aspect === 'original' ? 'original' : aspect}.${outBlob.type.includes('mp4') ? 'mp4' : 'webm'}`,
        title,
      })
      trackEvent('video_page_created')
      setPageMsg(`Página criada! Compartilhe este link: ${videoPageShareUrl(page.id)}`)
    } catch (err) {
      setPageMsg((err as Error).message)
    } finally {
      setPageBusy(false)
    }
  }

  const handleShare = async () => {
    if (!outBlob || shareBusy) return
    setShareBusy(true)
    setShareMsg(null)
    try {
      const ext = outBlob.type.includes('mp4') ? 'mp4' : 'webm'
      const outcome = await shareVideo({
        blob: outBlob,
        fileName: `alvoprompter-${aspect === 'original' ? 'original' : aspect}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`,
        title: currentScript?.title || 'Vídeo editado no AlvoPrompter',
        text: currentScript?.title,
      })
      setShareMsg(outcome === 'shared'
        ? 'Compartilhamento aberto — escolha Instagram, YouTube, TikTok ou outro app.'
        : 'O vídeo foi baixado. Abra a rede social para publicar.')
      trackEvent('video_shared')
    } catch (err) {
      if (!isShareCancelled(err)) setShareMsg((err as Error).message)
    } finally {
      setShareBusy(false)
    }
  }

  const handleShorts = async () => {
    if (!recording || !meta || processing) return
    if (keptRanges.length === 0) {
      setError('Nenhum trecho para exportar — desmarque os trechos que deseja remover.')
      return
    }
    const clips = keptRanges.slice(0, 12)
    const target = ASPECT_OPTIONS.find((a) => a.value === '9:16')!
    const crop = computeCrop(meta.w, meta.h, target.w!, target.h!)
    const theme = CAPTION_THEMES.find((t) => t.key === themeKey) ?? CAPTION_THEMES[0]!
    const logoOpt = logo
      ? { image: logo, position: logoPosition, widthPct: logoWidth, opacity: 0.9 }
      : undefined
    const musicOpt = music ? { buffer: music, volume: musicVolume } : undefined
    const chromaOpt = chromaEnabled
      ? {
          color: chromaColor,
          similarity: chromaSimilarity,
          smoothness: chromaSmoothness,
          bgColor: chromaBg,
        }
      : undefined

    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setShortsProgress(0)
    setProgress(0)
    setProcessing(true)
    try {
      const facePath = await ensureFacePath(controller.signal)
      const cropAt = facePath
        ? (t: number) => cropCenteredOnFace(facePath, t, meta.w, meta.h, target.w!, target.h!, eyeContact)
        : undefined
      for (let i = 0; i < clips.length; i++) {
        const idx = i
        const seg = clips[idx]!
        const range = { start: seg.start, end: Math.min(seg.end, meta.dur) }
        const blob = await renderVideo({
          sourceBlob: recording.blob,
          targetWidth: target.w!,
          targetHeight: target.h!,
          crop,
          cropAt,
          keepRanges: [range],
          captions: burnCaptions ? [{ start: seg.start, end: seg.end, text: seg.text }] : [],
          theme,
          highlightWords,
          intro: introEnabled && introText.trim()
            ? { text: introText.trim(), seconds: introSeconds }
            : undefined,
          outro: outroEnabled && outroText.trim()
            ? { text: outroText.trim(), seconds: outroSeconds }
            : undefined,
          logo: logoOpt,
          music: musicOpt,
          motion,
          chroma: chromaOpt,
          brandGradient: [brandFrom, brandTo],
          onProgress: (p) => setProgress(0.4 + 0.6 * ((idx + p) / clips.length)),
          signal: controller.signal,
        })
        const url = URL.createObjectURL(blob)
        setShorts((prev) => [...prev, { url, start: seg.start, end: seg.end }])
        setShortsProgress(idx + 1)
        await new Promise((r) => setTimeout(r, 50))
      }
      setProgress(1)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setProcessing(false)
      abortRef.current = null
    }
  }

  const applyPromptResult = (result: ClipPromptResult) => {
    for (const action of result.actions) {
      if (action.type === 'aspect') {
        setAspect(action.value)
      } else if (action.type === 'captions') {
        setBurnCaptions(true)
      } else if (action.type === 'cut-audio') {
        setAutoCut(true)
        setCutSource('audio')
      } else {
        if (segments.length === 0) {
          setError('Comando de tempo exige transcrição — grave no modo Fixa/Manual ou use o corte por áudio.')
          continue
        }
        setKeepMask(
          segments.map((s) => {
            if (action.type === 'trim-start') return s.end > action.seconds
            if (action.type === 'trim-end') return s.start < meta!.dur - action.seconds
            return s.end > action.from && s.start < action.to
          }),
        )
      }
    }
    setPromptText('')
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('prompter')}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            ← Voltar
          </button>
          <h1 className="text-lg font-semibold text-white">🎬 Editor de vídeo</h1>
        </div>
        <button
          onClick={() => {
            setRecording(null)
            setView('library')
          }}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Descartar gravação
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col">
          <div
            className="mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: previewAspect }}
          >
            <video
              ref={metaVideoRef}
              src={recording.url}
              playsInline
              muted
              loop
              autoPlay
              className="h-full w-full"
              style={{ objectFit: aspect === 'original' ? 'contain' : 'cover' }}
            />
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--muted)' }}>
            {meta ? `${meta.w}×${meta.h} · ${formatSrtTime(meta.dur)}` : 'Carregando vídeo...'}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Formato de exportação
            </h3>
            <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAspect(opt.value)}
                  className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: aspect === opt.value ? 'var(--accent)' : 'transparent',
                    color: aspect === opt.value ? 'black' : 'var(--muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {aspect !== 'original' &&
              (faceTrackingSupported() ? (
                <>
                  <label className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={reframe}
                      onChange={(e) => setReframe(e.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                    Reframe automático — segue o rosto
                  </label>
                  {reframe && (
                    <label className="mt-1 flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                      <input
                        type="checkbox"
                        checked={eyeContact}
                        onChange={(e) => setEyeContact(e.target.checked)}
                        className="h-4 w-4 accent-cyan-400"
                      />
                      Eye contact fix — olhos no terço superior
                    </label>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Reframe automático exige Chrome/Edge (API FaceDetector).
                </p>
              ))}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Legendas no vídeo
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Queimar legendas
              </label>
              {burnCaptions && (
                <>
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={highlightWords}
                      onChange={(e) => setHighlightWords(e.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                    Destacar palavra (Shorts)
                  </label>
                  <select
                  value={themeKey}
                  onChange={(e) => setThemeKey(e.target.value as CaptionThemeKey)}
                  className="rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {CAPTION_THEMES.filter((t) => t.key !== 'none').map((t) => (
                    <option key={t.key} value={t.key} style={{ background: 'var(--panel)' }}>
                      {t.label}
                    </option>
                  ))}
                </select>
                </>
              )}
            </div>
            {burnCaptions && (
              <div className="mt-3 flex flex-wrap gap-2">
                {CAPTION_THEMES.filter((t) => t.key !== 'none').map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setThemeKey(t.key)}
                    className="rounded-lg border px-3 py-2 text-xs transition-colors"
                    style={{
                      borderColor: themeKey === t.key ? 'var(--accent)' : 'var(--border)',
                      color: t.key === 'social' ? '#ffe066' : t.key === 'box' ? '#fff' : 'var(--text)',
                      background: t.key === 'box' && themeKey === t.key ? 'rgba(0,0,0,0.65)' : 'var(--panel)',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Marca & som
            </h3>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => logoFileRef.current?.click()}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {logo ? 'Trocar logo' : 'Upload logo (PNG/SVG)'}
                </button>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleLogoFile(f)
                    e.target.value = ''
                  }}
                />
                {logo && (
                  <>
                    <select
                      value={logoPosition}
                      onChange={(e) => setLogoPosition(e.target.value as LogoPosition)}
                      className="rounded-lg border bg-transparent px-2 py-1.5 text-xs text-white"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <option value="top-left" style={{ background: 'var(--panel)' }}>Canto sup. esq.</option>
                      <option value="top-right" style={{ background: 'var(--panel)' }}>Canto sup. dir.</option>
                      <option value="bottom-left" style={{ background: 'var(--panel)' }}>Canto inf. esq.</option>
                      <option value="bottom-right" style={{ background: 'var(--panel)' }}>Canto inf. dir.</option>
                    </select>
                    <button
                      onClick={() => setLogo(null)}
                      className="rounded-lg border px-2 py-1.5 text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>
              {logo && (
                <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                  Tamanho do logo: {logoWidth}% ·{' '}
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={1}
                    value={logoWidth}
                    onChange={(e) => setLogoWidth(Number(e.target.value))}
                    className="align-middle"
                  />
                </label>
              )}
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                  🪄 Avatar IA
                </p>
                <textarea
                  value={avatarPrompt}
                  onChange={(e) => setAvatarPrompt(e.target.value)}
                  placeholder="Descreva o apresentador do vídeo, ex.: mulher jovem, cabelo castanho, blazer azul, fundo de estúdio neutro"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-xs text-white outline-none"
                  style={{ borderColor: 'var(--border)' }}
                  rows={2}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void handleAvatar()}
                    disabled={avatarBusy || !avatarPrompt.trim()}
                    className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    {avatarBusy ? 'Gerando...' : 'Gerar avatar'}
                  </button>
                  {avatarPreview && (
                    <>
                      <button
                        onClick={() => void applyAvatarAsLogo()}
                        className="rounded-lg border px-3 py-1.5 text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                      >
                        Usar como logo
                      </button>
                      <button
                        onClick={downloadAvatar}
                        className="rounded-lg border px-3 py-1.5 text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                      >
                        Baixar PNG
                      </button>
                    </>
                  )}
                </div>
                {avatarError && (
                  <p className="mt-2 text-[11px]" style={{ color: 'var(--danger)' }}>
                    {avatarError}
                  </p>
                )}
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt="Avatar gerado por IA"
                    className="mt-3 h-28 w-28 rounded-xl border object-cover"
                    style={{ borderColor: 'var(--border)' }}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => musicFileRef.current?.click()}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {music ? 'Trocar música' : 'Música de fundo (mp3/ogg/wav)'}
                </button>
                <input
                  ref={musicFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleMusicFile(f)
                    e.target.value = ''
                  }}
                />
                {music && (
                  <>
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      Vol. {Math.round(musicVolume * 100)}%
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={musicVolume}
                        onChange={(e) => setMusicVolume(Number(e.target.value))}
                        className="w-24"
                      />
                    </label>
                    <button
                      onClick={() => {
                        stopMusicPreview()
                        setMusic(null)
                        setMusicTrackId(null)
                      }}
                      className="rounded-lg border px-2 py-1.5 text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MUSIC_LIBRARY.map((track) => (
                  <div
                    key={track.id}
                    className="rounded-xl border p-2.5"
                    style={{
                      borderColor: musicTrackId === track.id ? 'var(--accent)' : 'var(--border)',
                      background: musicTrackId === track.id ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {track.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {track.name}
                        </p>
                        <p className="truncate text-[10px]" style={{ color: 'var(--muted)' }}>
                          {track.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void handlePreviewTrack(track)}
                        disabled={musicBusy === track.id}
                        className="flex-1 rounded-lg border px-2 py-1 text-[11px]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                      >
                        {musicBusy === track.id ? 'Gerando...' : '▶ Ouvir'}
                      </button>
                      <button
                        onClick={() => void handleUseTrack(track)}
                        disabled={musicBusy === track.id || musicTrackId === track.id}
                        className="flex-1 rounded-lg border px-2 py-1 text-[11px]"
                        style={{
                          borderColor: musicTrackId === track.id ? 'var(--accent)' : 'var(--border)',
                          color: musicTrackId === track.id ? 'var(--accent)' : 'var(--text)',
                        }}
                      >
                        {musicTrackId === track.id ? '✓ Usando' : 'Usar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                As trilhas da galeria são geradas no próprio aparelho, livres de royalties, e repetem
                até o fim do vídeo. A música é mixada com o áudio da gravação durante a exportação.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Brand kit
            </h3>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                  <input
                    type="color"
                    value={brandFrom}
                    onChange={(e) => setBrandFrom(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border"
                    style={{ borderColor: 'var(--border)' }}
                    title="Cor 1 do gradiente da marca"
                  />
                  Cor 1
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                  <input
                    type="color"
                    value={brandTo}
                    onChange={(e) => setBrandTo(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border"
                    style={{ borderColor: 'var(--border)' }}
                    title="Cor 2 do gradiente da marca"
                  />
                  Cor 2
                </label>
                <button
                  onClick={() => {
                    setBrandFrom('#8B5CF6')
                    setBrandTo('#22D3EE')
                  }}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Restaurar padrão
                </button>
              </div>
              <div
                className="flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl"
                style={{ background: `linear-gradient(135deg, ${brandFrom}, ${brandTo})` }}
              >
                {logo && (
                  <img
                    src={logo.src}
                    alt=""
                    className="h-10 w-auto max-w-[40%] rounded object-contain"
                    style={{ background: 'rgba(255,255,255,0.25)' }}
                  />
                )}
                <div className="px-6 text-center text-sm font-bold text-white" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>
                  {introEnabled && introText.trim() ? introText.trim() : 'Seu roteiro no alvo'}
                </div>
                <div className="h-1 w-1/4 rounded-full bg-white/90" />
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                As cores do brand kit pintam os cards de intro e outro, o título animado do vídeo e ficam
                salvas neste aparelho.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Intro & outro de marca
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={introEnabled}
                  onChange={(e) => setIntroEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Intro
                <input
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  placeholder="Texto do intro (título do vídeo)"
                  disabled={!introEnabled}
                  className="flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={introSeconds}
                  onChange={(e) => setIntroSeconds(Number(e.target.value))}
                  disabled={!introEnabled}
                  className="w-14 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                  title="Segundos"
                />
              </div>
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={outroEnabled}
                  onChange={(e) => setOutroEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Outro
                <input
                  value={outroText}
                  onChange={(e) => setOutroText(e.target.value)}
                  placeholder="Texto do outro (CTA, canal, etc.)"
                  disabled={!outroEnabled}
                  className="flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={outroSeconds}
                  onChange={(e) => setOutroSeconds(Number(e.target.value))}
                  disabled={!outroEnabled}
                  className="w-14 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                  title="Segundos"
                />
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                Cards com o gradiente da marca aparecem no início (intro) e no fim (outro) do vídeo.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Fundo & movimento
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={chromaEnabled}
                  onChange={(e) => setChromaEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Remover fundo (chroma key)
              </label>
              {chromaEnabled && (
                <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      Cor-chave
                      <input
                        type="color"
                        value={chromaColor}
                        onChange={(e) => setChromaColor(e.target.value)}
                        className="h-7 w-10 cursor-pointer rounded border"
                        style={{ borderColor: 'var(--border)', background: 'transparent' }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                      Fundo novo
                      <input
                        type="color"
                        value={chromaBg}
                        onChange={(e) => setChromaBg(e.target.value)}
                        className="h-7 w-10 cursor-pointer rounded border"
                        style={{ borderColor: 'var(--border)', background: 'transparent' }}
                      />
                    </label>
                  </div>
                  <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                    Remoção: {chromaSimilarity}%
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={1}
                      value={chromaSimilarity}
                      onChange={(e) => setChromaSimilarity(Number(e.target.value))}
                      className="w-full"
                    />
                  </label>
                  <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                    Suavidade das bordas: {chromaSmoothness}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={chromaSmoothness}
                      onChange={(e) => setChromaSmoothness(Number(e.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Movimento de câmera (Ken Burns)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MOTION_PRESETS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMotion(m.value)}
                      className="rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                      style={{
                        borderColor: motion === m.value ? 'var(--accent)' : 'var(--border)',
                        color: motion === m.value ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                O chroma key remove o fundo verde/azul de cada frame antes do recorte. O movimento
                aplica zoom/pan no trecho entre cortes durante a exportação.
              </p>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                Corte por palavras {cutCount > 0 && `· ${cutCount} cortado${cutCount === 1 ? '' : 's'}`}
              </h3>
              {segments.length > 0 && (
                <button
                  onClick={selectFillers}
                  disabled={autoCut}
                  className="rounded-md border px-2 py-1 text-xs disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--warn)' }}
                >
                  Remover fillers
                </button>
              )}
            </div>
            {segments.length === 0 ? (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                Sem transcrição desta gravação (o corte por palavras fica disponível quando a
                legenda é gerada — use o modo Fixa/Manual para legendar).
              </p>
            ) : (
              <div className={autoCut ? 'pointer-events-none opacity-40' : ''}>
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {segments.map((seg, i) => {
                    const kept = keepMask[i] ?? true
                    const hasFiller = findFillers(seg.text).length > 0
                    return (
                    <li
                        key={i}
                        className="flex items-start gap-2 rounded-lg border p-2"
                        style={{
                          borderColor: kept ? 'var(--border)' : 'var(--danger)',
                          opacity: kept ? 1 : 0.55,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={kept}
                          onChange={() => toggleSegment(i)}
                          className="mt-0.5 h-4 w-4 accent-cyan-400"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] tabular-nums" style={{ color: 'var(--muted)' }}>
                            {fmt(seg)}
                          </p>
                          <p className="truncate text-xs text-white">{seg.text}</p>
                        </div>
                        {hasFiller && (
                          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--warn)' }}>
                            filler
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                B-rolls · cortar pausas
              </h3>
              {autoCut && activeRanges.length > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--ok)' }}>
                  −{Math.round(autoRemoved * 10) / 10}s
                </span>
              )}
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={autoCut}
                  onChange={(e) => setAutoCut(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Remover pausas automaticamente
              </label>
              {autoCut && (
                <>
                  <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => setCutSource('transcription')}
                      disabled={words.length === 0}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                      style={{
                        background: src === 'transcription' ? 'var(--accent)' : 'transparent',
                        color: src === 'transcription' ? 'black' : 'var(--muted)',
                      }}
                    >
                      Por transcrição
                    </button>
                    <button
                      onClick={() => setCutSource('audio')}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background: src === 'audio' ? 'var(--accent)' : 'transparent',
                        color: src === 'audio' ? 'black' : 'var(--muted)',
                      }}
                    >
                      Por áudio (silêncios)
                    </button>
                  </div>
                  {src === 'audio' ? (
                    audioError ? (
                      <p className="rounded-md border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                        {audioError}
                      </p>
                    ) : audioBuffer ? (
                      <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                        <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                          Corta pausas maiores que {autoCutMin} ms
                          <input
                            type="range"
                            min={100}
                            max={2000}
                            step={50}
                            value={autoCutMin}
                            onChange={(e) => setAutoCutMin(Number(e.target.value))}
                            className="w-full"
                          />
                        </label>
                        <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                          Margem ao redor da fala: {autoCutPad} ms
                          <input
                            type="range"
                            min={0}
                            max={300}
                            step={10}
                            value={autoCutPad}
                            onChange={(e) => setAutoCutPad(Number(e.target.value))}
                            className="w-full"
                          />
                        </label>
                        <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                          Sensibilidade ({audioThresholdDb} dB)
                          <input
                            type="range"
                            min={-55}
                            max={-20}
                            step={1}
                            value={audioThresholdDb}
                            onChange={(e) => setAudioThresholdDb(Number(e.target.value))}
                            className="w-full"
                          />
                        </label>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                          Duração: {formatSrtTime(autoBefore)} → {formatSrtTime(autoAfter)} ·{' '}
                          {activeRanges.length} trecho{activeRanges.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Analisando o áudio da gravação...
                      </p>
                    )
                  ) : (
                    words.length > 0 && (
                      <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                        <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                          Corta pausas maiores que {autoCutMin} ms
                          <input
                            type="range"
                            min={100}
                            max={2000}
                            step={50}
                            value={autoCutMin}
                            onChange={(e) => setAutoCutMin(Number(e.target.value))}
                            className="w-full"
                          />
                        </label>
                        <label className="block text-xs" style={{ color: 'var(--muted)' }}>
                          Margem ao redor da fala: {autoCutPad} ms
                          <input
                            type="range"
                            min={0}
                            max={300}
                            step={10}
                            value={autoCutPad}
                            onChange={(e) => setAutoCutPad(Number(e.target.value))}
                            className="w-full"
                          />
                        </label>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                          Duração: {formatSrtTime(autoBefore)} → {formatSrtTime(autoAfter)} ·{' '}
                          {activeRanges.length} trecho{activeRanges.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    )
                  )}
                </>
              )}
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                O corte pode usar o timing das palavras da transcrição ou analisar o áudio da
                gravação (RMS) para remover silêncios — funciona até sem transcrição. Quando
                ativo, substitui os cortes manuais.
              </p>
            </div>
          </section>

          {error && (
            <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          {processing ? (
            <div>
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                <span>Processando em tempo real — não feche esta aba...</span>
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-md border px-2 py-1"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancelar
                </button>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => void handleProcess()}
              disabled={!meta}
              className="w-full rounded-lg py-3 text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              🎬 Processar e exportar
            </button>
          )}

          {outUrl && (
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--ok)', background: 'var(--panel)' }}>
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--ok)' }}>
                ✓ Vídeo gerado
              </p>
              <video src={outUrl} controls playsInline className="mb-3 max-h-48 w-full rounded-lg" />
              {shareMsg && <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>{shareMsg}</p>}
              {pageMsg && <p className="mb-2 break-all text-xs" style={{ color: pageMsg.startsWith('Página criada') ? 'var(--ok)' : 'var(--danger)' }}>{pageMsg}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleShare()}
                  disabled={!outBlob || shareBusy}
                  className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold text-black disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {shareBusy ? 'Preparando…' : '↗ Compartilhar vídeo'}
                </button>
                <button
                  onClick={() => void handleCreateVideoPage()}
                  disabled={!outBlob || pageBusy}
                  className="flex-1 rounded-lg border px-4 py-2 text-center text-sm font-medium disabled:opacity-50"
                  style={{ borderColor: 'var(--accent-2)', color: 'var(--accent-2)' }}
                >
                  {pageBusy ? 'Enviando…' : '📄 Criar página de vídeo'}
                </button>
                <a
                  href={outUrl}
                  download={`alvoprompter-${aspect === 'original' ? 'original' : aspect}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`}
                  className="rounded-lg border px-4 py-2 text-center text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  Baixar vídeo editado
                </a>
                <a
                  href={recording.url}
                  download="alvoprompter-gravacao-original.webm"
                  className="rounded-lg border px-4 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  Original
                </a>
              </div>
            </div>
          )}

          <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              🗣️ Comando em linguagem natural
            </h3>
            <input
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptResults.length) applyPromptResult(promptResults[0]!)
              }}
              placeholder='Ex.: "pega a parte de 1:30 a 2:15 e deixa 9:16 com legendas"'
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none"
              style={{ borderColor: 'var(--border)' }}
            />
            {promptResults.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {promptResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => applyPromptResult(r)}
                    className="rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    title="Clique para aplicar"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {promptText.trim().length > 2 && promptResults.length === 0 && (
              <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                Não entendi — tente: “de 1:30 a 2:15”, “corte os primeiros 20 segundos”,
                “remova o silêncio”, “deixa 9:16”, “adiciona legendas”.
              </p>
            )}
          </section>

          {segments.length > 0 && (
            <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                ✂️ Fábrica de clipes 9:16
              </h3>
              {processing && shortsProgress > 0 ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Gerando clipe {shortsProgress} de {Math.min(keptRanges.length, 12)}...
                </p>
              ) : (
                <button
                  onClick={() => void handleShorts()}
                  disabled={keptRanges.length === 0}
                  className="w-full rounded-lg border py-2.5 text-sm font-semibold disabled:opacity-40"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Gerar 1 clipe por trecho ({keptRanges.length})
                </button>
              )}
              {shorts.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {shorts.map((s, i) => (
                    <div key={s.url} className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                      <video src={s.url} controls playsInline muted className="mb-1 w-full rounded" />
                      <a
                        href={s.url}
                        download={`alvoprompter-clipe-${i + 1}.webm`}
                        className="block rounded-md px-3 py-1.5 text-center text-xs font-semibold text-black"
                        style={{ background: 'var(--accent)' }}
                      >
                        Clipe {i + 1} · {formatSrtTime(s.end - s.start)}
                      </a>
                    </div>
                  ))}
                </div>
              )}
              {shorts.length > 0 && (
                <button
                  onClick={() => {
                    shorts.forEach((s) => URL.revokeObjectURL(s.url))
                    setShorts([])
                  }}
                  className="mt-2 text-xs underline"
                  style={{ color: 'var(--muted)' }}
                >
                  Limpar clipes
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
