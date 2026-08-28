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
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

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
      streamRef.current = stream
      if (videoElRef.current) videoElRef.current.srcObject = stream
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permissão de câmera/microfone negada.'
          : 'Não foi possível acessar a câmera.',
      )
    }
  }, [])

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
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoElRef.current) videoElRef.current.srcObject = null
    setStatus('idle')
  }, [stop])

  useEffect(
    () => () => {
      stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [stop],
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
