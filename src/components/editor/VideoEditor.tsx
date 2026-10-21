import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { formatSrtTime, type SrtSegment } from '../../lib/srt'
import { findFillers } from '../../lib/text'
import { autoCutRanges, detectSpeechRanges, estimateWordTimings, estimateSpeechSegments, totalRangesDuration } from '../../lib/cuts'
import { computeFacePath, cropCenteredOnFace, faceTrackingSupported, type FaceSample } from '../../lib/faceTrack'
import { parseClipPrompt, type ClipPromptResult } from '../../lib/clipPrompt'
import { generateAvatar, transcribeAudio } from '../../lib/cloudflare'
import { MUSIC_LIBRARY, generateMusicTrack, type MusicTrack } from '../../lib/music'
import { trackEvent } from '../../lib/stats'
import { createVideoPage, videoPageShareUrl } from '../../lib/videopage'
import { isShareCancelled, shareVideo, shareVideoFiles } from '../../lib/share'
import { readVideoInfo } from '../../lib/video/metadata'
import {
  CAPTION_THEMES,
  computeCrop,
  renderVideo,
  MOTION_PRESETS,
  type CaptionThemeKey,
  type LogoPosition,
  type MotionPreset,
} from '../../lib/video/render'

import { captionsFromWords, captionsForRanges, captionsSrt, extractTranscriptionAudio, validateTimedWords } from '../../lib/alignedCaptions'
import { useVideoProjectSave } from '../../hooks/useVideoProjectSave'
import { getVideoVersion, listVideoVersions, saveVideoVersion, updateVideoProject, type TimedWord, type VideoEdit, type VideoVersionSummary } from '../../lib/videoProjects'
import { prepareRecordedPlayback } from '../../lib/recordingAudio'
import CutPreview from './CutPreview'
import { applyTimeCut, cutHistoryReducer, emptyCutHistory, intersectRanges, normalizeRanges, removeRange } from '../../lib/editRanges'
import { SOCIAL_DESTINATIONS, socialDestination, socialFileName, storyRanges, storyFileName, exportWarnings, type SocialDestinationId, type ExportFileInfo, type ExportAspect } from '../../lib/socialExport'

type AspectOption = ExportAspect

const ASPECT_OPTIONS: { value: AspectOption; label: string; w?: number; h?: number }[] = [
  { value: 'original', label: 'Original' },
  { value: '9:16', label: '9:16', w: 1080, h: 1920 },
  { value: '4:5', label: '4:5', w: 1080, h: 1350 },
  { value: '1:1', label: '1:1', w: 1080, h: 1080 },
  { value: '16:9', label: '16:9', w: 1920, h: 1080 },
]

function fmt(seg: SrtSegment): string {
  return `${formatSrtTime(seg.start)} – ${formatSrtTime(seg.end)}`
}

export default function VideoEditor() {
  const id = useAppStore(s => s.recording?.project?.id ?? s.recording?.url)
  return <Editor key={id} />
}

function Editor() {
  const recording = useAppStore((s) => s.recording)
  const currentScript = useAppStore((s) => s.currentScript)
  const setRecording = useAppStore((s) => s.setRecording)
  const setView = useAppStore((s) => s.setView)

  const saved = recording?.project?.edit
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptionMessage, setTranscriptionMessage] = useState<string | null>(null)
  const transcriptionRef = useRef<AbortController | null>(null)
  useEffect(() => () => transcriptionRef.current?.abort(), [])
  const [alignedWords, setAlignedWords] = useState<TimedWord[]>(saved?.alignedWords ?? [])
  const [logoBlob, setLogoBlob] = useState<Blob | null>(saved?.logoBlob ?? null)
  const [musicBlob, setMusicBlob] = useState<Blob | null>(saved?.musicBlob ?? null)
  const [assetsReady, setAssetsReady] = useState(!saved?.logoBlob && !saved?.musicBlob && !saved?.musicTrackId)
  const [versions, setVersions] = useState<VideoVersionSummary[]>([])
  const [versionRevision, setVersionRevision] = useState(0)
  const [editorTab, setEditorTab] = useState('cuts')
  const [meta, setMeta] = useState<{ w: number; h: number; dur: number } | null>(null)
  const [aspect, setAspect] = useState<AspectOption>(saved?.aspect ?? '9:16')
  const [destination, setDestination] = useState<SocialDestinationId>(() => saved?.socialDestination ? socialDestination(saved.socialDestination).id : saved?.aspect && saved.aspect !== '9:16' ? 'custom' : 'reels')
  const [publicationText, setPublicationText] = useState(saved?.publicationText ?? currentScript?.title ?? '')
  const [exportQuality, setExportQuality] = useState<'hd' | 'compact'>(saved?.exportQuality ?? 'hd')
  const [storySeconds, setStorySeconds] = useState(saved?.storySeconds ?? 60)
  const [storyParts, setStoryParts] = useState<{ blob: Blob; url: string; name: string; duration: number }[]>([])
  const storyPartsRef = useRef(storyParts)
  storyPartsRef.current = storyParts
  useEffect(() => () => storyPartsRef.current.forEach(part => URL.revokeObjectURL(part.url)), [])
  const [outputInfo, setOutputInfo] = useState<(ExportFileInfo & { destination: SocialDestinationId; checked: boolean }) | null>(null)
  const [burnCaptions, setBurnCaptions] = useState(saved?.burnCaptions ?? true)
  const [highlightWords, setHighlightWords] = useState(saved?.highlightWords ?? true)
  const [themeKey, setThemeKey] = useState<CaptionThemeKey>(saved?.themeKey ?? 'cinema')
  const [segments, setSegments] = useState<SrtSegment[]>([])
  const [cuts, dispatchCuts] = useReducer(cutHistoryReducer, emptyCutHistory)
  const [rangeStart, setRangeStart] = useState('0')
  const [rangeEnd, setRangeEnd] = useState('0')
  const [fillersOnly, setFillersOnly] = useState(false)
  const [cutMessage, setCutMessage] = useState<string | null>(null)

  const [autoCut, setAutoCut] = useState(false)
  const [autoCutMin, setAutoCutMin] = useState(400)
  const [autoCutPad, setAutoCutPad] = useState(60)
  const [cutSource, setCutSource] = useState<'transcription' | 'audio'>('audio')
  const [audioThresholdDb, setAudioThresholdDb] = useState(-35)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioRanges, setAudioRanges] = useState<{ start: number; end: number }[]>([])

  const [logoBusy, setLogoBusy] = useState(false)
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(saved?.logoPosition ?? 'top-left')
  const [logoWidth, setLogoWidth] = useState(saved?.logoWidth ?? 15)
  const [music, setMusic] = useState<AudioBuffer | null>(null)
  const [musicVolume, setMusicVolume] = useState(saved?.musicVolume ?? 0.3)
  const [musicTrackId, setMusicTrackId] = useState<string | null>(saved?.musicTrackId ?? null)
  const [musicBusy, setMusicBusy] = useState<string | null>(null)
  const musicCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const musicPreviewRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)
  const ownedLogoUrl = useRef<string | null>(null)
  useEffect(() => () => { if (ownedLogoUrl.current) URL.revokeObjectURL(ownedLogoUrl.current) }, [])
  const logoFileRef = useRef<HTMLInputElement>(null)
  const musicFileRef = useRef<HTMLInputElement>(null)

  const [avatarPrompt, setAvatarPrompt] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const [motion, setMotion] = useState<MotionPreset>(saved?.motion ?? 'none')
  const [chromaEnabled, setChromaEnabled] = useState(saved?.chromaEnabled ?? false)
  const [chromaColor, setChromaColor] = useState(saved?.chromaColor ?? '#00b140')
  const [chromaSimilarity, setChromaSimilarity] = useState(saved?.chromaSimilarity ?? 45)
  const [chromaSmoothness, setChromaSmoothness] = useState(saved?.chromaSmoothness ?? 30)
  const [chromaBg, setChromaBg] = useState(saved?.chromaBg ?? '#ffffff')

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [outUrl, setOutUrl] = useState<string | null>(null)
  const [outBlob, setOutBlob] = useState<Blob | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [pageReview, setPageReview] = useState(false)
  const [pageBusy, setPageBusy] = useState(false)
  const [pageMsg, setPageMsg] = useState<string | null>(null)
  const [reframe, setReframe] = useState(saved?.reframe ?? false)
  const [eyeContact, setEyeContact] = useState(saved?.eyeContact ?? false)
  const facePathRef = useRef<FaceSample[] | null>(null)
  const [promptText, setPromptText] = useState('')
  const [introEnabled, setIntroEnabled] = useState(saved?.introEnabled ?? false)
  const [introText, setIntroText] = useState(saved?.introText ?? '')
  const [introSeconds, setIntroSeconds] = useState(saved?.introSeconds ?? 3)
  const [outroEnabled, setOutroEnabled] = useState(saved?.outroEnabled ?? false)
  const [outroText, setOutroText] = useState(saved?.outroText ?? '')
  const [outroSeconds, setOutroSeconds] = useState(saved?.outroSeconds ?? 3)
  const [brandFrom, setBrandFrom] = useState(() => saved?.brandFrom ?? localStorage.getItem('ap.brandFrom') ?? '#8B5CF6')
  const [brandTo, setBrandTo] = useState(() => saved?.brandTo ?? localStorage.getItem('ap.brandTo') ?? '#22D3EE')

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
    setMeta(null)
    setSegments([])
    dispatchCuts({ type: 'reset', ranges: [] })
    setAutoCut(false)
    setAudioBuffer(null)
    setAudioRanges([])
    setOutUrl(null)
    setOutBlob(null)
    setError(null)
    setCutMessage(null)
    setFillersOnly(false)
    facePathRef.current = null
    let initialized = false
    let seekingDuration = false
    const onLoaded = () => {
      if (!Number.isFinite(v.duration) || v.duration <= 0) { seekingDuration = true; v.currentTime = 1e9; return }
      if (initialized) return
      initialized = true
      dispatchCuts(saved ? { type: 'hydrate', history: saved.cuts } : { type: 'reset', ranges: [{ start: 0, end: v.duration }] })
      setRangeStart('0')
      setRangeEnd(String(v.duration))
      setMeta({ w: v.videoWidth, h: v.videoHeight, dur: v.duration || 0 })
      if (saved) setSegments(saved.segments)
      else if (recording.utterances?.length) {
        const segs = estimateSpeechSegments(recording.utterances)
        setSegments(segs)
      }
    }
    const onDuration = () => { if (seekingDuration && Number.isFinite(v.duration) && v.duration > 0) { seekingDuration = false; v.currentTime = 0; onLoaded() } }
    const onError = () => setError('Não foi possível abrir a gravação. Volte e grave novamente.')
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('error', onError)
    v.load()
    return () => { v.removeEventListener('loadedmetadata', onLoaded); v.removeEventListener('durationchange', onDuration); v.removeEventListener('error', onError) }
  }, [recording, saved])

  useEffect(
    () => () => {
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

  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    if (!saved) return
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      try {
        if (saved.logoBlob) {
          const url = URL.createObjectURL(saved.logoBlob); urls.push(url)
          const img = new Image(); img.src = url; await img.decode()
          if (!cancelled) setLogo(img)
        }
        if (saved.musicBlob) {
          const ctx = new OfflineAudioContext(1, 1, 44100)
          const buffer = await ctx.decodeAudioData(await saved.musicBlob.arrayBuffer())
          if (!cancelled) setMusic(buffer)
        } else if (saved.musicTrackId) {
          const track = MUSIC_LIBRARY.find(t => t.id === saved.musicTrackId)
          if (!track) throw new Error('Trilha indisponível')
          const buffer = await generateMusicTrack(track)
          if (!cancelled) setMusic(buffer)
        }
        if (!cancelled) setAssetsReady(true)
      } catch { if (!cancelled) setError('Não foi possível recuperar a logo ou trilha. Reabra esta edição para tentar novamente.') }
    })()
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [saved])

  const renderEdit = useMemo<VideoEdit | null>(() => meta && assetsReady ? ({
    cuts, aspect, burnCaptions, highlightWords, themeKey, segments, alignedWords,
    logoBlob, logoPosition, logoWidth, musicBlob, musicTrackId, musicVolume,
    motion, chromaEnabled, chromaColor, chromaSimilarity, chromaSmoothness, chromaBg,
    reframe, eyeContact, introEnabled, introText, introSeconds, outroEnabled, outroText, outroSeconds, brandFrom, brandTo,
  }) : null, [meta, assetsReady, cuts, aspect, burnCaptions, highlightWords, themeKey, segments, alignedWords,
    logoBlob, logoPosition, logoWidth, musicBlob, musicTrackId, musicVolume,
    motion, chromaEnabled, chromaColor, chromaSimilarity, chromaSmoothness, chromaBg,
    reframe, eyeContact, introEnabled, introText, introSeconds, outroEnabled, outroText, outroSeconds, brandFrom, brandTo])
  const edit = useMemo(() => renderEdit ? { ...renderEdit, socialDestination: destination, publicationText, exportQuality, storySeconds } : null, [renderEdit, destination, publicationText, exportQuality, storySeconds])
  const projectSave = useVideoProjectSave(recording?.project, edit)
  useEffect(() => {
    const project = recording?.project
    if (!project) return
    let live = true
    void listVideoVersions(project.id, project.scope).then(rows => { if (live) setVersions(rows) }).catch(() => { if (live) setError('Não foi possível abrir as versões exportadas.') })
    return () => { live = false }
  }, [recording, versionRevision])
  useEffect(() => {
    setOutUrl(null); setOutBlob(null); setOutputInfo(null); setPageReview(false); setShareMsg(null)
    storyPartsRef.current.forEach(part => URL.revokeObjectURL(part.url)); setStoryParts([])
  }, [renderEdit, exportQuality, storySeconds])

  const promptResults = useMemo<ClipPromptResult[]>(
    () => (promptText.trim().length > 2 ? parseClipPrompt(promptText) : []),
    [promptText],
  )

  const words = useMemo(() => alignedWords.length ? alignedWords.map(w => ({ word: w.word, start: w.start, end: w.end })) : estimateWordTimings(recording?.utterances ?? []), [recording, alignedWords])
  const speechSegments = useMemo(() => alignedWords.length ? captionsFromWords(alignedWords) : estimateSpeechSegments(recording?.utterances ?? []), [recording, alignedWords])
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

  const selectedDuration = totalRangesDuration(cuts.present)
  const suggestedRanges = useMemo(() => intersectRanges(cuts.present, activeRanges, meta?.dur ?? 0), [cuts.present, activeRanges, meta?.dur])

  useEffect(() => {
    setOutUrl(null)
    setOutBlob(null)
    setOutputInfo(null)
    setShareMsg(null)
  }, [cuts.present])

  if (!recording) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-4 py-8 sm:px-6">
        <p style={{ color: 'var(--muted)' }}>Nenhuma gravação para editar.</p>
        <button
          onClick={() => setView('library')}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Voltar ao prompter
        </button>
      </div>
    )
  }

  const previewAspect = meta ? meta.w / meta.h : 16 / 9
  const keptRanges = speechSegments.flatMap(segment =>
    intersectRanges([segment], cuts.present, meta?.dur ?? 0).map(r => ({ ...r, text: segment.text })),
  )
  const cutCount = meta ? Math.max(0, meta.dur - selectedDuration) : 0
  const applyRanges = (ranges: { start: number; end: number }[]) => {
    if (!meta || processing) return
    const normalized = normalizeRanges(ranges, meta.dur)
    if (!normalized.length) {
      setCutMessage('Esse corte removeria todo o vídeo. Ajuste os tempos para manter pelo menos um trecho.')
      return
    }
    dispatchCuts({ type: 'apply', ranges: normalized })
    setCutMessage('Seleção atualizada. Confira os cortes na prévia com áudio.')
  }
  const applyManualRange = (mode: 'keep' | 'remove') => {
    if (!meta) return
    const start = Number(rangeStart), end = Number(rangeEnd)
    if (!rangeStart.trim() || !rangeEnd.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > meta.dur) {
      setCutMessage('Informe início e fim válidos, dentro da duração do vídeo.')
      return
    }
    const range = { start, end }
    applyRanges(mode === 'keep' ? intersectRanges(cuts.present, [range], meta.dur) : removeRange(cuts.present, range, meta.dur))
  }

  const handleTranscribe = async () => {
    if (transcribing || !meta || meta.dur > 720) return
    const controller = new AbortController(); transcriptionRef.current = controller
    setTranscribing(true); setTranscriptionMessage('Preparando áudio…')
    try {
      const audio = await extractTranscriptionAudio(recording.blob, controller.signal)
      setTranscriptionMessage('Transcrevendo e alinhando as palavras…')
      const result = await transcribeAudio(audio, useAppStore.getState().settings.voiceLang.split('-')[0] || 'pt', controller.signal)
      controller.signal.throwIfAborted()
      const timed = validateTimedWords(result.words, meta.dur)
      setAlignedWords(timed); setSegments(captionsFromWords(timed)); setBurnCaptions(true)
      setTranscriptionMessage('Legendas alinhadas ao áudio. Revise os textos e ouça os trechos antes de cortar.')
    } catch (err) { if (!controller.signal.aborted) setTranscriptionMessage((err as Error).message); else setTranscriptionMessage('Transcrição cancelada. As legendas anteriores foram mantidas.') }
    finally { if (transcriptionRef.current === controller) { transcriptionRef.current = null; setTranscribing(false) } }
  }
  const downloadSrt = () => {
    const url = URL.createObjectURL(new Blob([captionsSrt(captionsForRanges(segments, alignedWords, cuts.present), cuts.present)], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'legendas-editadas.srt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleLogoFile = (file: File) => {
    setLogoBusy(true)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { if (ownedLogoUrl.current) URL.revokeObjectURL(ownedLogoUrl.current); ownedLogoUrl.current = url; setLogo(img); setLogoBlob(file); setLogoBusy(false) }
    img.onerror = () => { setLogoBusy(false); URL.revokeObjectURL(url); setError('Não foi possível abrir a logo.') }
    img.src = url
  }

  const handleMusicFile = async (file: File) => {
    setMusicBusy('upload')
    try {
      const buffer = await file.arrayBuffer()
      const ac = new OfflineAudioContext(1, 1, 44100)
      const audioBuffer = await ac.decodeAudioData(buffer)
      stopMusicPreview()
      setMusic(audioBuffer)
      setMusicTrackId(null)
      setMusicBlob(file)
    } catch {
      setError('Não foi possível decodificar o arquivo de áudio.')
    } finally { setMusicBusy(null) }
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
      setMusicBlob(null)
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
    const blob = await (await fetch(avatarPreview)).blob()
    img.onload = () => { setLogo(img); setLogoBlob(blob) }
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
    if (!recording || !meta || processing || !assetsReady || musicBusy || logoBusy) return
    if (!cuts.present.length) { setError('Selecione ao menos um trecho para exportar.'); return }
    stopMusicPreview()
    metaVideoRef.current?.pause()
    setError(null)
    setOutUrl(null)
    setOutBlob(null)
    setShareMsg(null)
    setProgress(0)
    const target = ASPECT_OPTIONS.find((a) => a.value === aspect)!
    const scale = exportQuality === 'compact' ? Math.min(1, 1280 / Math.max(target.w ?? meta.w, target.h ?? meta.h)) : 1
    const targetW = Math.max(2, Math.round((target.w ?? meta.w) * scale / 2) * 2)
    const targetH = Math.max(2, Math.round((target.h ?? meta.h) * scale / 2) * 2)
    const makeStories = destination === 'stories' && storySeconds > 0
    if (makeStories) {
      try { storyRanges(selectedDuration + (introEnabled && introText.trim() ? introSeconds : 0) + (outroEnabled && outroText.trim() ? outroSeconds : 0), storySeconds, .15) }
      catch (error) { setError((error as Error).message); return }
    }
    storyPartsRef.current.forEach(part => URL.revokeObjectURL(part.url)); setStoryParts([])
    const crop =
      aspect === 'original'
        ? { sx: 0, sy: 0, sw: meta.w, sh: meta.h }
        : computeCrop(meta.w, meta.h, targetW, targetH)
    const ranges = cuts.present
    const cues = burnCaptions
      ? captionsForRanges(segments, alignedWords, cuts.present)
      : []

    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    try {
      await projectSave.flush()
      if (recording.project) await updateVideoProject(recording.project.id, recording.project.scope, { exportState: 'rendering' })
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
        videoBitsPerSecond: exportQuality === 'compact' ? 2_500_000 : 8_000_000,
        onProgress: (p) => setProgress(makeStories ? 0.45 * p : 0.4 + 0.6 * p),
        signal: controller.signal,
      })
      const url = URL.createObjectURL(blob)
      if (outUrl) URL.revokeObjectURL(outUrl)
      setOutUrl(url)
      setOutBlob(blob)
      setOutputInfo({ width: targetW, height: targetH, duration: totalRangesDuration(ranges), bytes: blob.size, type: blob.type, destination, checked: false })
      setProgress(makeStories ? .45 : 1)
      if (recording.project && edit) {
        try { await saveVideoVersion(recording.project.id, recording.project.scope, blob, edit); setVersionRevision(r => r + 1) }
        catch { setError('Vídeo gerado, mas não foi possível guardar a versão. Baixe o arquivo antes de sair.') }
      }
      trackEvent('video_exported')
      if (makeStories) {
        const info = await readVideoInfo(blob, controller.signal)
        const parts = storyRanges(info.duration, storySeconds, .15)
        for (let index = 0; index < parts.length; index++) {
          const range = parts[index]!
          const part = await renderVideo({ sourceBlob: blob, targetWidth: info.width, targetHeight: info.height, crop: { sx: 0, sy: 0, sw: info.width, sh: info.height }, keepRanges: [range], captions: [], theme: CAPTION_THEMES.find(t => t.key === 'none')!, videoBitsPerSecond: exportQuality === 'compact' ? 2_500_000 : 8_000_000, signal: controller.signal, onProgress: p => setProgress(0.45 + 0.55 * (index + p) / parts.length) })
          const name = storyFileName(index, parts.length, part.type)
          setStoryParts(previous => [...previous, { blob: part, url: URL.createObjectURL(part), name, duration: range.end - range.start }])
          if (recording.project && edit) await saveVideoVersion(recording.project.id, recording.project.scope, part, edit, `Instagram Stories · parte ${index + 1} de ${parts.length}`)
          setVersionRevision(r => r + 1)
        }
        setShareMsg('Partes numeradas e salvas na biblioteca. Confira cada uma e publique na ordem indicada.')
        setProgress(1)
      }
    } catch (err) {
      const cancelled = (err as Error).name === 'AbortError'
      setError(cancelled ? 'Exportação cancelada. Sua edição foi mantida; você pode tentar novamente.' : (err as Error).message)
      if (recording.project) void updateVideoProject(recording.project.id, recording.project.scope, { exportState: cancelled ? 'cancelled' : 'failed' }).catch(() => {})
    } finally {
      setProcessing(false)
      abortRef.current = null
    }
  }

  const handleCreateVideoPage = async () => {
    if (!outBlob || pageBusy) return
    setPageBusy(true)
    setPageReview(false)
    setPageMsg(null)
    try {
      const title =
        introEnabled && introText.trim()
          ? introText.trim()
          : currentScript?.title || 'Meu vídeo no AlvoPrompter'
      const page = await createVideoPage({
        blob: outBlob,
        fileName: socialFileName(outputInfo?.destination ?? 'custom', outBlob.type),
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
      const outcome = await shareVideo({
        blob: outBlob,
        fileName: socialFileName(outputInfo?.destination ?? 'custom', outBlob.type),
        title: currentScript?.title || 'Vídeo editado no AlvoPrompter',
        text: publicationText.trim() || undefined,
      })
      setShareMsg(outcome === 'shared'
        ? 'Menu de compartilhamento aberto. Conclua a publicação na rede escolhida; o AlvoPrompter não confirma a postagem.'
        : 'Arquivo baixado. Abra a rede escolhida e selecione este vídeo; use Copiar texto para levar sua legenda.')
      trackEvent('video_shared')
    } catch (err) {
      if (!isShareCancelled(err)) setShareMsg((err as Error).message)
    } finally {
      setShareBusy(false)
    }
  }

  const handleShorts = async () => {
    if (!recording || !meta || processing || !assetsReady || musicBusy || logoBusy) return
    if (keptRanges.length === 0) {
      setError('Nenhum trecho de fala na seleção atual. Ajuste os cortes antes de gerar clipes.')
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
          captions: burnCaptions ? captionsForRanges(segments, alignedWords, [range]) : [],
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
        if (recording.project && edit) await saveVideoVersion(recording.project.id, recording.project.scope, blob, { ...edit, aspect: '9:16', cuts: { past: [], present: [range], future: [] } })
        setVersionRevision(r => r + 1)
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
    if (!meta || processing) return
    let nextRanges = cuts.present
    for (const action of result.actions) {
      if (action.type === 'aspect') {
        setAspect(action.value)
      } else if (action.type === 'captions') {
        setBurnCaptions(true)
      } else if (action.type === 'cut-audio') {
        setAutoCut(true)
        setCutSource('audio')
      } else {
        nextRanges = applyTimeCut(nextRanges, action, meta.dur)
      }
    }
    if (nextRanges !== cuts.present) applyRanges(nextRanges)
    setPromptText('')
  }

  return (
    <div className="video-editor mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (projectSave.status === 'error') { if (window.confirm('Há alterações não salvas. Baixe o original antes de sair. Sair mesmo assim?')) setView('library'); return }; void projectSave.flush().then(() => setView('library')).catch(() => setError('A edição ainda não foi salva. Tente novamente.')) }}
            disabled={processing || transcribing || Boolean(musicBusy) || logoBusy}
            className="min-h-11 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            ← Biblioteca
          </button>
          <div><p className="studio-eyebrow">SEU VÍDEO, DO SEU JEITO</p><h1 className="text-xl font-semibold">Finalizar vídeo</h1><p className="text-sm" style={{ color: 'var(--muted)' }}>{recording.project?.title ?? currentScript?.title ?? 'Minha gravação'}</p></div>
        </div>
        <button disabled={processing || transcribing || !edit || projectSave.status === 'saving'} className="min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={() => void projectSave.flush().then(() => setView('library')).catch(() => setError('Não foi possível salvar. Mantenha a tela aberta e tente novamente.'))}>Salvar e continuar depois</button>
        <button
          disabled={processing || transcribing || Boolean(musicBusy) || logoBusy}
          onClick={() => {
            if (!recording.project) return
            void projectSave.flush().then(() => updateVideoProject(recording.project!.id, recording.project!.scope, { deletedAt: Date.now() })).then(() => {
              setRecording(null); setView('library')
            }).catch(() => setError('Não foi possível mover a gravação para a lixeira. Tente novamente.'))
          }}
          className="min-h-11 rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Mover para lixeira
        </button>
      </div>

      <div role="status" className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: projectSave.error ? 'var(--danger)' : 'var(--border)', background: 'var(--panel)' }}>
        {musicBusy || logoBusy ? 'Preparando logo ou trilha…' : !assetsReady ? 'Recuperando logo e trilha…' : projectSave.error ?? (projectSave.status === 'saved' ? 'Edição salva neste aparelho · retome pela biblioteca' : 'Salvando gravação e edição…')}
        {projectSave.error && <button onClick={projectSave.retry} className="ml-3 min-h-11 underline">Tentar salvar novamente</button>}
        {recording.project?.exportState === 'rendering' && <p>A exportação anterior foi interrompida. Sua edição foi recuperada; gere o vídeo novamente.</p>}
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col lg:sticky lg:top-6 lg:self-start">
          <div
            className="mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black"
            style={{ aspectRatio: previewAspect, width: `min(100%, ${46 * previewAspect}dvh)` }}
          >
            <video ref={metaVideoRef} src={recording.url} preload="metadata" muted hidden />
            <CutPreview url={recording.url} ranges={cuts.present} disabled={processing || !meta} />
          </div>
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--muted)' }}>
            {meta ? `Prévia dos cortes com áudio · ${selectedDuration.toFixed(2)} s de ${meta.dur.toFixed(2)} s` : 'Carregando vídeo...'}
            <br />Para conferir legendas, trilha e efeitos, gere a prévia final abaixo.
          </p>
          <fieldset disabled={processing || shareBusy} className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <legend className="px-1 text-sm font-semibold">Onde você vai publicar?</legend>
            <label className="block text-xs" htmlFor="export-destination">Destino do vídeo</label>
            <select id="export-destination" className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={destination} onChange={e => {
              const next = socialDestination(e.target.value)
              setDestination(next.id)
              if (next.aspect) setAspect(next.aspect)
              if (!next.aspect || next.aspect === aspect) setOutputInfo(info => info ? { ...info, destination: next.id } : info)
            }}>
              {SOCIAL_DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {aspect === 'original' ? 'Preserva o formato da gravação.' : `${aspect}${exportQuality === 'compact' ? ' · resolução reduzida para um arquivo menor.' : ` · ${ASPECT_OPTIONS.find(a => a.value === aspect)?.w} × ${ASPECT_OPTIONS.find(a => a.value === aspect)?.h}.`}`} MP4 quando disponível neste aparelho.
              {aspect !== 'original' && ' O formato pode recortar as bordas. Confira o enquadramento na prévia final.'}
            </p>
            <label className="mt-3 block text-xs font-semibold" htmlFor="export-quality">Tamanho do arquivo</label>
            <select id="export-quality" className="mt-1 min-h-11 w-full rounded-xl border px-3 text-sm" value={exportQuality} onChange={e => setExportQuality(e.target.value as 'hd' | 'compact')}>
              <option value="hd">Alta qualidade</option><option value="compact">Compacto · até 720p, arquivo menor</option>
            </select>
            {destination === 'stories' && <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <label className="block text-xs font-semibold" htmlFor="story-seconds">Entrega dos Stories</label>
              <select id="story-seconds" className="mt-1 min-h-11 w-full rounded-xl border px-2 text-sm" value={storySeconds} onChange={e => setStorySeconds(Number(e.target.value))}>
                <option value={60}>Partes de até 60 segundos</option><option value={30}>Partes de até 30 segundos</option><option value={15}>Partes de até 15 segundos</option><option value={0}>Um vídeo completo</option>
              </select>
              <p className="mt-2 text-xs leading-relaxed">Formato vertical 9:16. As partes seguem a linha do vídeo editado, sem repetir a abertura, com arquivos numerados. Elas ficam guardadas em Versões exportadas. Mantenha o app aberto durante o preparo e confira o limite disponível no Instagram antes de publicar.</p>
            </div>}
          </fieldset>
          <div className="mt-4 flex flex-col gap-4" aria-live="polite">
          {error && (
            <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          {processing ? (
            <div>
              <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                <span>Preparando seu vídeo… mantenha o app aberto.</span>
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="min-h-11 rounded-md border px-3 py-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  Cancelar
                </button>
              </div>
              <div role="progressbar" aria-label="Preparação do vídeo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--brand-gradient)' }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => void handleProcess()}
              disabled={!meta || !cuts.present.length || !assetsReady || transcribing || Boolean(musicBusy) || logoBusy}
              className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--brand-gradient)' }}
            >
              {destination === 'stories' && storySeconds > 0 ? 'Preparar Stories em partes' : `Preparar vídeo${destination === 'custom' ? '' : ` para ${socialDestination(destination).label}`}`}
            </button>
          )}

          {destination === 'stories' && storyParts.length > 0 && <section aria-label="Stories preparados" className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-semibold">Seus Stories em ordem</h2>
            <p className="my-2 text-xs">Assista às partes antes de publicar. Salve no Fotos/arquivos pelo menu do aparelho e selecione na ordem indicada no Instagram.</p>
            <button className="mb-3 min-h-11 w-full rounded-xl border px-3 text-sm font-semibold" disabled={processing || shareBusy} onClick={async () => {
              setShareBusy(true)
              try { await shareVideoFiles(storyParts.map(part => ({ blob: part.blob, fileName: part.name }))); setShareMsg('Menu aberto com as partes em ordem. Escolha salvar ou compartilhar; confirme a ordem no Instagram.') }
              catch (error) { if (!isShareCancelled(error)) setShareMsg((error as Error).message) }
              finally { setShareBusy(false) }
            }}>Salvar / compartilhar todas as partes</button>
            <div className="grid grid-cols-2 gap-3">{storyParts.map((part, index) => <article key={part.url} className="min-w-0 rounded-xl border p-2" style={{ borderColor: 'var(--border)' }}>
              <p className="mb-2 text-xs font-semibold">Parte {index + 1} · {part.duration.toFixed(1)} s</p><video aria-label={`Prévia do Story ${index + 1}`} src={part.url} controls playsInline onPlay={prepareRecordedPlayback} className="max-h-56 w-full rounded-lg" />
              <button disabled={processing || shareBusy} className="mt-2 min-h-11 w-full rounded-lg border px-2 text-xs" onClick={async () => { try { await shareVideo({ blob: part.blob, fileName: part.name, title: `Story ${index + 1}` }) } catch (error) { if (!isShareCancelled(error)) setShareMsg((error as Error).message) } }}>Salvar / compartilhar parte {index + 1}</button>
            </article>)}</div>
          </section>}
          {outUrl && (
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--ok)', background: 'var(--panel)' }}>
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--ok)' }}>
                Vídeo preparado{outputInfo ? ` para ${socialDestination(outputInfo.destination).label}` : ''} · assista antes de compartilhar
              </p>
              <video aria-label="Prévia final do vídeo" src={outUrl} onPlay={prepareRecordedPlayback} onLoadedMetadata={e => {
                const video = e.currentTarget
                setOutputInfo(info => info ? { ...info, width: video.videoWidth, height: video.videoHeight, duration: video.duration, checked: true } : info)
              }} onError={() => setShareMsg('Não foi possível reproduzir o arquivo final. Gere o vídeo novamente antes de compartilhar.')} controls playsInline className="mb-3 max-h-48 w-full rounded-lg" />
              {outputInfo && <div className="mb-3 text-xs leading-relaxed">
                <p>{outputInfo.checked ? 'Arquivo conferido' : 'Conferindo arquivo…'} · {outputInfo.type.includes('mp4') ? 'MP4' : 'WebM'} · {outputInfo.width} × {outputInfo.height} · {outputInfo.duration.toFixed(1)} s · {(outputInfo.bytes / 1024 / 1024).toFixed(1)} MB</p>
                {outputInfo.checked && exportWarnings(outputInfo.destination, outputInfo).map(warning => <p key={warning} className="mt-2" style={{ color: 'var(--danger)' }}>{warning}</p>)}
                <p className="mt-2">{socialDestination(outputInfo.destination).tip} Se a rede não aparecer no menu, baixe o vídeo e importe por ela.</p>
              </div>}
              <label className="mb-1 block text-xs font-semibold" htmlFor="publication-text">Texto da publicação</label>
              <textarea id="publication-text" value={publicationText} maxLength={2200} onChange={e => setPublicationText(e.target.value)} rows={3} className="w-full rounded-lg border p-2 text-sm" />
              <button type="button" disabled={!publicationText.trim()} className="mb-3 min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50" onClick={async () => {
                try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(publicationText); setShareMsg('Texto copiado. Cole no campo de legenda da rede escolhida.') }
                catch { setShareMsg('Selecione e copie o texto acima. Este aparelho não permitiu a cópia automática.') }
              }}>Copiar texto</button>
              {shareMsg && <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>{shareMsg}</p>}
              {pageMsg && <p className="mb-2 break-all text-xs" style={{ color: pageMsg.startsWith('Página criada') ? 'var(--ok)' : 'var(--danger)' }}>{pageMsg}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleShare()}
                  disabled={!outBlob || shareBusy}
                  className="min-h-11 flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  {shareBusy ? 'Preparando…' : '↗ Compartilhar vídeo'}
                </button>
                <button
                  onClick={() => setPageReview(true)}
                  disabled={!outBlob || pageBusy}
                  className="min-h-11 flex-1 rounded-lg border px-4 py-2 text-center text-sm font-medium disabled:opacity-50"
                  style={{ borderColor: 'var(--accent-2)', color: 'var(--brand-strong)' }}
                >
                  {pageBusy ? 'Enviando…' : 'Criar link público'}
                </button>
                <a
                  href={outUrl}
                  download={socialFileName(outputInfo?.destination ?? 'custom', outBlob?.type ?? 'video/webm')}
                  className="min-h-11 rounded-lg border px-4 py-2 text-center text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  Baixar vídeo editado
                </a>
                <a
                  href={recording.url}
                  download={`alvoprompter-gravacao-original.${recording.blob.type.includes('mp4') ? 'mp4' : 'webm'}`}
                  className="min-h-11 rounded-lg border px-4 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  Original
                </a>
              </div>
              {pageReview && <div role="group" aria-label="Confirmar link público" className="mt-3 rounded-lg border p-3 text-sm">
                <p>O vídeo será enviado para a nuvem. Qualquer pessoa com o link poderá assistir. Baixar ou compartilhar pelo aparelho não cria um link público.</p>
                <div className="mt-2 flex flex-wrap gap-2"><button className="min-h-11 rounded-lg border px-3 font-semibold" onClick={() => void handleCreateVideoPage()}>Enviar e criar link público</button><button className="min-h-11 rounded-lg border px-3" onClick={() => setPageReview(false)}>Cancelar link público</button></div>
              </div>}
            </div>
          )}

          <button onClick={() => void shareVideo({ blob: recording.blob, fileName: `gravacao-original.${recording.blob.type.includes('mp4') ? 'mp4' : 'webm'}` }).catch(error => { if (!isShareCancelled(error)) setError((error as Error).message) })} className="min-h-11 rounded-xl border px-4 py-3 text-center text-sm">Salvar original no aparelho / compartilhar</button>
          {versions.length > 0 && <details><summary>Versões exportadas ({versions.length})</summary><div className="space-y-2">{versions.map((version, index) => <button key={version.id} className="min-h-11 w-full rounded-xl border px-3 text-left text-sm" onClick={() => { void getVideoVersion(version.id, version.scope).then(savedVersion => { if (!savedVersion) throw new Error(); const oldTarget = ASPECT_OPTIONS.find(a => a.value === savedVersion.edit.aspect)!; setOutputInfo({width: oldTarget.w ?? meta?.w ?? 0, height: oldTarget.h ?? meta?.h ?? 0, duration: totalRangesDuration(savedVersion.edit.cuts.present), bytes: savedVersion.blob.size, type: savedVersion.blob.type, destination: socialDestination(savedVersion.edit.socialDestination).id, checked: false}); setOutBlob(savedVersion.blob); setOutUrl(URL.createObjectURL(savedVersion.blob)) }).catch(() => setError('Não foi possível abrir essa versão. Tente novamente.')) }}>Assistir {version.label ?? `versão ${versions.length - index}`} · {new Date(version.createdAt).toLocaleString('pt-BR')}</button>)}</div></details>}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <nav aria-label="Etapas da edição" className="editor-steps">
            {[['cuts', '1. Cortes'], ['captions', '2. Legendas'], ['style', '3. Visual e áudio']].map(([id, title]) => <button key={id} aria-pressed={editorTab === id} onClick={() => setEditorTab(id!)}>{title}</button>)}
          </nav>
          <fieldset disabled={processing || !assetsReady || Boolean(musicBusy) || logoBusy} className="editor-panels contents" data-step={editorTab}>
          <details hidden={editorTab !== 'style'} open><summary>Formato de exportação</summary>
            <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border)' }}>
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  aria-pressed={aspect === opt.value}
                  onClick={() => { setAspect(opt.value); setDestination('custom') }}
                  className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: aspect === opt.value ? 'var(--accent)' : 'transparent',
                    color: aspect === opt.value ? 'white' : 'var(--muted)',
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
                      Enquadrar olhos no terço superior
                    </label>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                  O enquadramento automático não está disponível neste dispositivo.
                </p>
              ))}
          </details>

          <details hidden={editorTab !== 'captions'} open><summary>Legendas no vídeo</summary>
            <div className="mb-4 space-y-3">
              <p>{alignedWords.length ? 'Tempos obtidos do áudio. Revise a transcrição antes de exportar.' : 'Os tempos da fala ao vivo são aproximados. Gere legendas a partir do áudio para alinhar as palavras.'}</p>
              <p style={{ color: 'var(--muted)' }}>Ao transcrever, o áudio é enviado ao serviço de IA. Tomadas de até 12 minutos.</p>
              <button onClick={() => void handleTranscribe()} disabled={transcribing || !meta || meta.dur > 720} className="min-h-11 rounded-xl border px-4 font-semibold">{transcribing ? 'Transcrevendo…' : 'Transcrever e alinhar legendas'}</button>
              {transcribing && <button className="ml-2 min-h-11 underline" onClick={() => transcriptionRef.current?.abort()}>Cancelar transcrição</button>}
              {transcriptionMessage && <p role="status">{transcriptionMessage}</p>}
              {segments.length > 0 && <button className="ml-2 min-h-11 underline" onClick={downloadSrt}>Baixar legendas SRT</button>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Incluir legendas
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
                    Destacar palavras
                  </label>

                </>
              )}
            </div>
            {burnCaptions && (
              <div className="mt-3 flex flex-wrap gap-2">
                {CAPTION_THEMES.filter((t) => t.key !== 'none').map((t) => (
                  <button
                    key={t.key}
                    aria-pressed={themeKey === t.key}
                    onClick={() => setThemeKey(t.key)}
                    className="rounded-lg border px-3 py-2 text-xs transition-colors"
                    style={{
                      borderColor: themeKey === t.key ? 'var(--accent)' : 'var(--border)',
                      color: t.key === 'social' ? '#ffe066' : '#fff',
                      background: themeKey === t.key ? '#42317b' : '#232837',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </details>

          <details hidden={editorTab !== 'captions'}><summary>Revisar texto das legendas ({segments.length})</summary>
            <div className="max-h-96 space-y-3 overflow-y-auto">{segments.map((seg, index) => <label key={index} className="block text-sm">{fmt(seg)}<textarea aria-label={`Legenda ${index + 1}`} className="mt-1 w-full rounded-lg border p-3" value={seg.text} onChange={e => setSegments(previous => previous.map((item, i) => i === index ? { ...item, text: e.target.value } : item))} /></label>)}</div>
          </details>
          {alignedWords.length > 0 && <details hidden={editorTab !== 'cuts'}><summary>Selecionar uma palavra para revisar</summary><p>Toque na palavra para preencher o intervalo. Ouça a prévia e use “Remover este intervalo” se desejar cortar.</p><div className="mt-3 flex max-h-72 flex-wrap gap-2 overflow-y-auto">{alignedWords.map((word, i) => <button key={i} disabled={word.end <= word.start} title={word.end <= word.start ? 'Palavra preservada na legenda, sem duração individual para corte.' : undefined} className="rounded-lg border px-3 text-sm disabled:opacity-50" onClick={() => { setRangeStart(word.start.toFixed(3)); setRangeEnd(word.end.toFixed(3)); setCutMessage(`Palavra selecionada: ${word.word}. Confira o intervalo antes de remover.`) }}>{word.word} <span className="text-xs">{word.start.toFixed(2)}s</span></button>)}</div></details>}

          <details hidden={editorTab !== 'style'}><summary>Logo e trilha sonora</summary>
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
                      aria-label="Posição da logo"
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
                      onClick={() => { setLogo(null); setLogoBlob(null) }}
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
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-strong)' }}>
                  🪄 Avatar IA
                </p>
                <textarea
                  aria-label="Descrição do avatar"
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
                        setMusicBlob(null)
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
          </details>

          <details hidden={editorTab !== 'style'}><summary>Identidade visual</summary>
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
                As cores da marca pintam a abertura, o encerramento e o título animado do vídeo e ficam
                salvas neste aparelho.
              </p>
            </div>
          </details>

          <details hidden={editorTab !== 'style'}><summary>Abertura e encerramento</summary>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  aria-label="Incluir abertura"
                  checked={introEnabled}
                  onChange={(e) => setIntroEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Abertura
                <input
                  aria-label="Texto da abertura"
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  placeholder="Título do vídeo"
                  disabled={!introEnabled}
                  className="min-w-0 flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Duração da abertura"
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
                  aria-label="Incluir encerramento"
                  checked={outroEnabled}
                  onChange={(e) => setOutroEnabled(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Encerramento
                <input
                  aria-label="Texto do encerramento"
                  value={outroText}
                  onChange={(e) => setOutroText(e.target.value)}
                  placeholder="Convite final ou nome do canal"
                  disabled={!outroEnabled}
                  className="min-w-0 flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Duração do encerramento"
                  value={outroSeconds}
                  onChange={(e) => setOutroSeconds(Number(e.target.value))}
                  disabled={!outroEnabled}
                  className="w-14 rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white outline-none disabled:opacity-40"
                  style={{ borderColor: 'var(--border)' }}
                  title="Segundos"
                />
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                A abertura e o encerramento aparecem sobre os segundos escolhidos do vídeo, com as cores da marca.
              </p>
            </div>
          </details>

          <details hidden={editorTab !== 'style'}><summary>Fundo e movimento</summary>
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
          </details>

          <details hidden={editorTab !== 'cuts'} open><summary>Cortes por tempo {cutCount > 0 && `· ${cutCount.toFixed(2)} s removidos`}</summary>
            <fieldset disabled={processing || !meta} className="space-y-3 disabled:opacity-50">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Tempos em segundos do vídeo original. Ajuste o intervalo e ouça antes de exportar.</p>
              <div className="flex flex-wrap gap-3">
                <label className="min-w-0 flex-1 text-xs">Início (s)
                  <input aria-label="Início do corte em segundos" type="number" min="0" max={meta?.dur} step="0.01" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                </label>
                <label className="min-w-0 flex-1 text-xs">Fim (s)
                  <input aria-label="Fim do corte em segundos" type="number" min="0" max={meta?.dur} step="0.01" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="mt-1 w-full rounded border bg-transparent p-2" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyManualRange('keep')} className="min-h-11 rounded-lg border px-3 text-xs">Manter só este intervalo</button>
                <button type="button" onClick={() => applyManualRange('remove')} className="min-h-11 rounded-lg border px-3 text-xs">Remover este intervalo</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!cuts.past.length} onClick={() => { dispatchCuts({ type: 'undo' }); setCutMessage('Corte desfeito.') }} className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Desfazer corte</button>
                <button type="button" disabled={!cuts.future.length} onClick={() => { dispatchCuts({ type: 'redo' }); setCutMessage('Corte refeito.') }} className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Refazer corte</button>
                <button type="button" onClick={() => applyRanges([{ start: 0, end: meta!.dur }])} className="min-h-11 rounded-lg border px-3 text-xs">Restaurar vídeo inteiro</button>
              </div>
              <p className="text-xs" aria-label="Intervalos mantidos">Mantidos: {cuts.present.map(r => `${r.start.toFixed(2)}–${r.end.toFixed(2)} s`).join(' · ') || 'Carregando…'}</p>
              {cutMessage && <p role="status" className="text-xs" style={{ color: 'var(--muted)' }}>{cutMessage}</p>}
            </fieldset>
          </details>

          <details hidden={editorTab !== 'cuts'}><summary>Revisar falas e vícios</summary>
            <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>Os tempos das falas são aproximados. Revisar apenas preenche o intervalo; ajuste os limites e aplique o corte acima. Nenhuma frase é removida automaticamente.</p>
            <label className="mb-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={fillersOnly} onChange={e => setFillersOnly(e.target.checked)} />Mostrar apenas possíveis hesitações
            </label>
            {speechSegments.length === 0 ? <p className="text-xs">Sem transcrição. Os cortes por tempo continuam disponíveis.</p> : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {speechSegments.map((seg, i) => {
                  const fillers = findFillers(seg.text).filter(f => f.removable)
                  if (fillersOnly && !fillers.length) return null
                  return <li key={i} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{fmt(seg)} · estimado</p>
                    <p className="my-1 whitespace-normal break-words text-sm">{seg.text}</p>
                    {fillers.length > 0 && <p className="text-xs" style={{ color: 'var(--warn)' }}>Revisar: {fillers.map(f => f.word).join(', ')}</p>}
                    <button disabled={processing || !meta} onClick={() => {
                      setRangeStart(String(Math.min(seg.start, meta!.dur)))
                      setRangeEnd(String(Math.min(seg.end, meta!.dur)))
                      setCutMessage('Intervalo estimado preenchido. Ajuste os tempos antes de remover.')
                    }} className="mt-2 min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Revisar este trecho</button>
                  </li>
                })}
                {fillersOnly && !speechSegments.some(seg => findFillers(seg.text).some(f => f.removable)) && <li className="text-xs">Nenhuma hesitação sugerida.</li>}
              </ul>
            )}
          </details>

          <details hidden={editorTab !== 'cuts'}><summary>Sugerir cortes de pausas</summary>
            <div className="mb-2 flex items-center justify-between">

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
                  disabled={processing}
                  onChange={(e) => setAutoCut(e.target.checked)}
                  className="h-4 w-4 accent-cyan-400"
                />
                Analisar pausas para sugerir cortes
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
                      Transcrição (estimativa)
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
              {autoCut && <div className="space-y-2">
                <p className="text-xs">Após aplicar: {totalRangesDuration(suggestedRanges).toFixed(2)} s mantidos.</p>
                <button disabled={processing || !suggestedRanges.length || (src === 'audio' && (!audioBuffer || !!audioError))} onClick={() => applyRanges(suggestedRanges)} className="min-h-11 rounded-lg border px-3 text-xs disabled:opacity-40">Aplicar sugestões de pausas</button>
                {activeRanges.length === 0 && (src !== 'audio' || audioBuffer) && <p className="text-xs">Nenhum trecho detectado. A seleção atual foi preservada.</p>}
              </div>}
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                A análise por áudio procura silêncios; música e ruído podem afetar o resultado.
                A transcrição usa tempos estimados. As sugestões só alteram o vídeo após aplicar,
                preservando os cortes já feitos. Confira o resultado na prévia.
              </p>
            </div>
          </details>

          <details hidden={editorTab !== 'cuts'}><summary>Comando em linguagem natural</summary>

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
          </details>

          {segments.length > 0 && (
            <details hidden={editorTab !== 'cuts'}><summary>Fábrica de clipes 9:16</summary>

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
                      <video src={s.url} onPlay={prepareRecordedPlayback} controls playsInline className="mb-1 w-full rounded" />
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
            </details>
          )}
          </fieldset>
        </div>
      </div>
    </div>
  )
}
