/** Observe delivered camera frames, not scene motion (a person may stand still).
 * Recover a paused preview once per interruption. Stop a damaged take rather
 * than silently record minutes of audio after its last video frame.
 */
export function monitorRecordingCamera(
  camera: MediaStream,
  getPreview: () => HTMLVideoElement | null,
  onInterrupted: () => void,
): () => void {
  let source: HTMLVideoElement | null = null
  let frame: number | null = null
  let lastFrame = performance.now()
  let lastTime = -1
  let resumed = false
  let active = true
  const cancelFrame = () => {
    if (source && frame !== null) source.cancelVideoFrameCallback?.(frame)
    frame = null
  }
  const onFrame = () => {
    if (!active || !source) return
    lastFrame = performance.now()
    resumed = false
    frame = source.requestVideoFrameCallback(onFrame)
  }
  const interval = setInterval(() => {
    const now = performance.now()
    const preview = getPreview()
    if (preview !== source) {
      cancelFrame()
      source = preview
      lastFrame = now
      lastTime = -1
      resumed = false
      if (source?.requestVideoFrameCallback) frame = source.requestVideoFrameCallback(onFrame)
    }
    const track = camera.getVideoTracks()[0]
    // currentTime is only a fallback on engines without decoded-frame callbacks.
    if (source && !source.requestVideoFrameCallback && source.currentTime !== lastTime && !source.paused && !track?.muted) {
      lastTime = source.currentTime
      lastFrame = now
      resumed = false
    }
    if (source?.paused && !resumed && track?.readyState === 'live') {
      resumed = true
      void source.play().catch(() => undefined)
    }
    if (track?.readyState === 'ended' || now - lastFrame > 5000) {
      stop()
      onInterrupted()
    }
  }, 500)
  const stop = () => {
    active = false
    clearInterval(interval)
    cancelFrame()
  }
  return stop
}
