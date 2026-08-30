import { useCallback, useEffect, useRef, useState } from 'react'

type RecorderStatus = 'idle' | 'requesting' | 'ready' | 'recording' | 'error'

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  const filterRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineVideoRef = useRef<HTMLVideoElement | null>(null)
  const pipelineTrackRef = useRef<MediaStreamTrack | null>(null)
  const rafRef = useRef<number | null>(null)

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

  const teardownPipeline = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    pipelineTrackRef.current?.stop()
    pipelineTrackRef.current = null
    if (pipelineVideoRef.current) {
      pipelineVideoRef.current.removeAttribute('src')
      pipelineVideoRef.current.load()
      pipelineVideoRef.current = null
    }
    canvasRef.current = null
  }, [])

  const buildPipeline = useCallback((css: string) => {
    const camera = cameraStreamRef.current
    if (!camera) return
    const videoTrack = camera.getVideoTracks()[0]
    const audioTrack = camera.getAudioTracks()[0]
    const s = videoTrack?.getSettings()
    const w = s?.width || 1280
    const h = s?.height || 720
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.filter = css
    const src = document.createElement('video')
    src.muted = true
    src.playsInline = true
    src.autoplay = true
    src.srcObject = camera
    const capture = canvas.captureStream(30)
    const pipeTrack = capture.getVideoTracks()[0]
    const draw = () => {
      if (src.readyState >= 2) ctx.drawImage(src, 0, 0, w, h)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    const combined = new MediaStream([pipeTrack, audioTrack].filter((t): t is MediaStreamTrack => !!t))
    canvasRef.current = canvas
    pipelineVideoRef.current = src
    pipelineTrackRef.current = pipeTrack
    streamRef.current = combined
    if (videoElRef.current) videoElRef.current.srcObject = combined
  }, [])

  const setFilter = useCallback(
    (css: string | null) => {
      filterRef.current = css
      if (!streamRef.current || !cameraStreamRef.current) return
      teardownPipeline()
      if (css) buildPipeline(css)
      else {
        streamRef.current = cameraStreamRef.current
        if (videoElRef.current) videoElRef.current.srcObject = cameraStreamRef.current
      }
    },
    [buildPipeline, teardownPipeline],
  )

  const enable = useCallback(async () => {
    if (streamRef.current) return
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      cameraStreamRef.current = stream
      streamRef.current = stream
      if (filterRef.current) buildPipeline(filterRef.current)
      if (videoElRef.current) videoElRef.current.srcObject = streamRef.current
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permissão de câmera/microfone negada.'
          : 'Não foi possível acessar a câmera.',
      )
    }
  }, [buildPipeline])

  const start = useCallback(() => {
    const stream = streamRef.current
    if (!stream || recorderRef.current) return
    const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
    let recorder: MediaRecorder
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream)
    } catch {
      setStatus('error')
      setError('Este aparelho não conseguiu iniciar a gravação com a câmera selecionada.')
      return
    }
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      setVideoBlob(blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setVideoUrl(url)
      setStatus('ready')
    }
    recorder.start(1500)
    recorderRef.current = recorder
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    setStatus('recording')
  }, [])

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorderRef.current = null
  }, [])

  const disable = useCallback(() => {
    stop()
    teardownPipeline()
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
    streamRef.current = null
    if (videoElRef.current) videoElRef.current.srcObject = null
    setStatus('idle')
  }, [stop, teardownPipeline])

  useEffect(
    () => () => {
      stop()
      teardownPipeline()
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [stop, teardownPipeline],
  )

  return {
    status,
    error,
    videoUrl,
    videoBlob,
    elapsed,
    isRecording: status === 'recording',
    enable,
    start,
    stop,
    disable,
    attachVideo,
    setFilter,
  }
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
