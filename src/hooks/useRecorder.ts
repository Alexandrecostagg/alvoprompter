import { useCallback, useEffect, useRef, useState } from 'react'
import { startRecordingSession, type RecordingSession } from '../lib/recordingSession'
import { createRecordingPipeline, type RecordingPipeline } from '../lib/recordingPipeline'

type RecorderStatus = 'idle' | 'requesting' | 'ready' | 'recording' | 'finishing' | 'error'

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<RecordingSession | null>(null)
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  const filterRef = useRef<string | null>(null)
  const pipelineRef = useRef<RecordingPipeline | null>(null)
  const appliedFilterRef = useRef<string | null>(null)
  const pendingEnableRef = useRef<Promise<void> | null>(null)
  const cameraGeneration = useRef(0)
  const mountedRef = useRef(true)
  const disablingRef = useRef<Promise<void> | null>(null)

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
    if (disablingRef.current) return disablingRef.current.then(() => enable())
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

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const start = useCallback((): boolean => {
    if (!streamRef.current || recorderRef.current || disablingRef.current) return false
    try {
      applyFilter()
      const session = startRecordingSession(streamRef.current)
      recorderRef.current = session
      setError(null)
      setVideoBlob(null)
      setVideoUrl(null)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
      setStatus('recording')
      void session.result.then((blob) => {
        if (!mountedRef.current || recorderRef.current !== session) return
        setVideoBlob(blob)
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setVideoUrl(url)
        setStatus(streamRef.current ? 'ready' : 'idle')
      }, (error: Error) => {
        if (!mountedRef.current || recorderRef.current !== session) return
        setStatus('error')
        setError(error.message)
      }).finally(() => {
        if (recorderRef.current === session) { recorderRef.current = null; clearTimer() }
      })
      return true
    } catch (error) {
      setStatus('error')
      setError(error instanceof Error ? error.message : 'Não foi possível iniciar a gravação.')
      return false
    }
  }, [applyFilter, clearTimer])

  const stop = useCallback(() => {
    clearTimer()
    const session = recorderRef.current
    if (session) {
      setStatus('finishing')
      session.stop()
    }
  }, [clearTimer])

  const disable = useCallback((): Promise<void> => {
    if (disablingRef.current) return disablingRef.current
    cameraGeneration.current++
    pendingEnableRef.current = null
    const session = recorderRef.current
    if (session) { clearTimer(); session.stop() }
    const release = () => {
      teardownPipeline()
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
      streamRef.current = null
      if (videoElRef.current) videoElRef.current.srcObject = null
      if (mountedRef.current) setStatus('idle')
    }
    if (!session) { release(); return Promise.resolve() }
    const pending = session.result.catch(() => undefined).then(release).finally(() => {
      if (disablingRef.current === pending) disablingRef.current = null
    })
    disablingRef.current = pending
    return pending
  }, [clearTimer, teardownPipeline])

  const retry = useCallback(async () => {
    await disable()
    if (mountedRef.current) await enable()
  }, [disable, enable])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void disable()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [disable])

  return {
    status,
    error,
    videoUrl,
    videoBlob,
    elapsed,
    isFinishing: status === 'finishing',
    retry,
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
