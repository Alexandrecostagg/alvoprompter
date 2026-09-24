import { useCallback, useEffect, useRef, useState } from 'react'
import { createRecordingPipeline, type RecordingPipeline } from '../lib/recordingPipeline'

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
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  const filterRef = useRef<string | null>(null)
  const pipelineRef = useRef<RecordingPipeline | null>(null)
  const appliedFilterRef = useRef<string | null>(null)
  const pendingEnableRef = useRef<Promise<void> | null>(null)
  const cameraGeneration = useRef(0)

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    const previous = videoElRef.current
    if (previous && previous !== el) previous.srcObject = null
    videoElRef.current = el
    // Preview the camera directly: timer updates and encoder effects must not reset playback.
    if (el && el.srcObject !== cameraStreamRef.current) el.srcObject = cameraStreamRef.current
  }, [])

  const teardownPipeline = useCallback(() => {
    pipelineRef.current?.dispose()
    pipelineRef.current = null
    appliedFilterRef.current = null
  }, [])

  const applyFilter = useCallback(() => {
    const camera = cameraStreamRef.current
    if (!camera) return
    const css = filterRef.current
    if (pipelineRef.current) {
      pipelineRef.current.setFilter(css)
    } else if (css) {
      // Never replace a MediaRecorder input track while a recording is active.
      if (recorderRef.current) return
      pipelineRef.current = createRecordingPipeline(camera, css)
      streamRef.current = pipelineRef.current.stream
    }
    appliedFilterRef.current = css
  }, [])

  const setFilter = useCallback((css: string | null) => {
    if (filterRef.current === css && appliedFilterRef.current === css) return
    filterRef.current = css
    try { applyFilter(); setError(null) }
    catch (error) { setError((error as Error).message) }
  }, [applyFilter])

  const enable = useCallback((): Promise<void> => {
    if (pendingEnableRef.current) return pendingEnableRef.current
    if (cameraStreamRef.current) return Promise.resolve()
    const generation = ++cameraGeneration.current
    setError(null)
    setStatus('requesting')
    const request = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (generation !== cameraGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return }
        cameraStreamRef.current = stream
        streamRef.current = stream
        try { applyFilter() } catch (error) { setError((error as Error).message) }
        if (videoElRef.current && videoElRef.current.srcObject !== stream) videoElRef.current.srcObject = stream
        setStatus('ready')
      } catch (err) {
        if (generation !== cameraGeneration.current) return
        setStatus('error')
        setError(err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Permissão de câmera/microfone negada.' : 'Não foi possível acessar a câmera.')
      }
    })()
    pendingEnableRef.current = request
    void request.finally(() => { if (pendingEnableRef.current === request) pendingEnableRef.current = null })
    return request
  }, [applyFilter])

  const start = useCallback(() => {
    if (!streamRef.current || recorderRef.current) return
    try { applyFilter() } catch (error) { setError((error as Error).message); return }
    const stream = streamRef.current
    setError(null)
    let recorder: MediaRecorder
    try {
      const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream)
    } catch {
      setStatus('error')
      setError('Este aparelho não conseguiu iniciar a gravação com a câmera selecionada.')
      return
    }
    const chunks: Blob[] = []
    let failed = false
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = () => {
      if (recorderRef.current !== recorder) return
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      recorderRef.current = null
      if (timerRef.current != null) window.clearInterval(timerRef.current)
      timerRef.current = null
      if (failed) return
      if (!blob.size) { setStatus('error'); setError('A gravação ficou vazia. Verifique a câmera e tente novamente.'); return }
      setVideoBlob(blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setVideoUrl(url)
      setStatus(streamRef.current ? 'ready' : 'idle')
    }
    recorder.onerror = () => {
      failed = true
      if (timerRef.current != null) window.clearInterval(timerRef.current)
      timerRef.current = null
      setStatus('error')
      setError('A gravação foi interrompida pelo aparelho. Tente novamente com um vídeo menor.')
    }
    try { recorder.start(1500) } catch { setStatus('error'); setError('Não foi possível iniciar a gravação.'); return }
    recorderRef.current = recorder
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    setStatus('recording')
  }, [applyFilter])

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    // Retain the recorder until onstop flushes its final chunk.
  }, [])

  const disable = useCallback(() => {
    cameraGeneration.current++
    pendingEnableRef.current = null
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
      cameraGeneration.current++
      pendingEnableRef.current = null
      if (recorderRef.current) { recorderRef.current.onstop = null; recorderRef.current.ondataavailable = null; recorderRef.current.onerror = null }
      stop()
      recorderRef.current = null
      teardownPipeline()
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
      streamRef.current = null
      if (videoElRef.current) videoElRef.current.srcObject = null
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
