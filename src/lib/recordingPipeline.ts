export interface RecordingPipeline {
  stream: MediaStream
  setFilter: (css: string | null) => void
  dispose: () => void
}

/** One canvas track per camera session; changing the effect never replaces it. */
export function createRecordingPipeline(camera: MediaStream, css: string): RecordingPipeline {
  const settings = camera.getVideoTracks()[0]?.getSettings()
  const canvas = document.createElement('canvas')
  canvas.width = settings?.width || 1280
  canvas.height = settings?.height || 720
  const context = canvas.getContext('2d')
  if (!context || !('filter' in context) || typeof canvas.captureStream !== 'function') {
    throw new Error('Este aparelho não suporta o filtro na gravação. Selecione Nenhum para gravar sem filtro.')
  }
  context.filter = css
  const source = document.createElement('video')
  source.muted = true
  source.playsInline = true
  source.autoplay = true
  source.srcObject = camera
  let active = true
  let frame: number | null = null
  let animation: number | null = null
  let lastPaint = -Infinity
  const paint = () => {
    if (source.readyState >= 2) context.drawImage(source, 0, 0, canvas.width, canvas.height)
  }
  // Prefer decoded camera frames instead of redrawing at the display's 60/120 Hz.
  const videoFrame = () => {
    if (!active) return
    paint()
    frame = source.requestVideoFrameCallback(videoFrame)
  }
  const fallbackFrame = (now: number) => {
    if (!active) return
    if (now - lastPaint >= 1000 / 30) { paint(); lastPaint = now }
    animation = requestAnimationFrame(fallbackFrame)
  }
  let output: MediaStream | null = null
  const dispose = () => {
    if (!active) return
    active = false
    if (frame !== null) source.cancelVideoFrameCallback(frame)
    if (animation !== null) cancelAnimationFrame(animation)
    output?.getVideoTracks().forEach((track) => track.stop())
    source.pause()
    source.srcObject = null
    source.removeAttribute('src')
    source.load()
  }
  try {
    output = canvas.captureStream(30)
    if (!output.getVideoTracks().length) throw new Error('O aparelho não criou a imagem filtrada.')
    void source.play().catch(() => undefined)
    if (typeof source.requestVideoFrameCallback === 'function') frame = source.requestVideoFrameCallback(videoFrame)
    else animation = requestAnimationFrame(fallbackFrame)
    return {
      stream: new MediaStream([...output.getVideoTracks(), ...camera.getAudioTracks()]),
      setFilter: (next) => { context.filter = next || 'none' },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
