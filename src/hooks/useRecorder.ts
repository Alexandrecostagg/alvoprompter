import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createCamera } from '../lib/capture/createCamera'
import { captureContext, preserveCapturedMovie } from '../lib/capture/context'
import type { CaptureController } from '../lib/capture/CaptureController'

/** React observes the capture owner; rendering the teleprompter never rebuilds it. */
export function useRecorder() {
  const owner = useRef<CaptureController | null>(null)
  if (!owner.current) owner.current = createCamera()
  const camera = owner.current
  const snapshot = useSyncExternalStore(camera.subscribe, camera.getSnapshot)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const blob = snapshot.movie?.blob
    if (!blob) { setVideoUrl(null); return }
    const url = URL.createObjectURL(blob)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [snapshot.movie?.blob])
  useEffect(() => {
    if (snapshot.phase !== 'recording' || !snapshot.startedAt) return
    const startedAt = snapshot.startedAt
    setElapsed(0)
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [snapshot.phase, snapshot.startedAt])
  useEffect(() => () => { void camera.close().then(async () => {
    const movie = camera.getSnapshot().movie
    if (movie) await preserveCapturedMovie(movie)
  }).catch(error => console.error('A tomada não pôde ser guardada na biblioteca.', error)) }, [camera])
  const retry = useCallback(async () => { await camera.close(); await camera.open() }, [camera])
  const start = useCallback(() => camera.start(captureContext()), [camera])
  const stop = useCallback(() => { void camera.stop() }, [camera])
  return {
    status: snapshot.phase === 'opening' ? 'requesting' as const : snapshot.phase === 'failed' ? 'error' as const : snapshot.phase,
    error: snapshot.error,
    warning: snapshot.warning,
    isNative: camera.port.native,
    filterUnavailable: true,
    // Old callers may send a preference; the new capture deliberately records original pixels.
    setFilter: (_css: string | null) => {},
    capturedMovie: snapshot.movie,
    videoBlob: snapshot.movie?.blob ?? null,
    videoUrl,
    elapsed,
    isFinishing: snapshot.phase === 'finishing' || snapshot.phase === 'starting',
    isRecording: snapshot.phase === 'recording',
    enable: camera.open,
    start,
    stop,
    disable: camera.close,
    retry,
    attachPreview: camera.attach,
    attachVideo: camera.attach,
  }
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`
}
