import { Capacitor } from '@capacitor/core'

export interface RecordingPipeline {
  stream: MediaStream
  setFilter: (css: string | null) => void
  setSource: (source: HTMLVideoElement | null) => void
  dispose: () => void
}

export function supportsRecordingFilters(): boolean {
  // Keep iPhone recording on the camera track, avoiding the canvas encoder path.
  if (Capacitor.getPlatform() === 'ios' || (typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)))) return false
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    return Boolean(context && 'filter' in context && typeof canvas.captureStream === 'function')
  } catch { return false }
}

/** Use the live preview, never a detached second video decoder (WebKit may suspend it). */
export function createRecordingPipeline(camera: MediaStream, css: string, preview: HTMLVideoElement): RecordingPipeline {
  const settings = camera.getVideoTracks()[0]?.getSettings()
  const canvas = document.createElement('canvas')
  canvas.width = settings?.width || 1280
  canvas.height = settings?.height || 720
  const context = canvas.getContext('2d')
  if (!context || !('filter' in context) || typeof canvas.captureStream !== 'function') {
    throw new Error('Este aparelho não suporta o filtro na gravação. Selecione Nenhum para gravar sem filtro.')
  }
  context.filter = css
  let source: HTMLVideoElement | null = preview
  let active = true
  let animation: number | null = null
  let lastPaint = -Infinity
  let output: MediaStream | null = null
  // A single bounded animation loop also works if WebKit stops delivering
  // requestVideoFrameCallback notifications. The visible preview owns playback.
  const paint = (now: number) => {
    if (!active) return
    if (source && source.readyState >= 2 && now - lastPaint >= 1000 / 30) {
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      lastPaint = now
    }
    animation = requestAnimationFrame(paint)
  }
  const dispose = () => {
    if (!active) return
    active = false
    if (animation !== null) cancelAnimationFrame(animation)
    output?.getVideoTracks().forEach((track) => track.stop())
    source = null
    // Camera/microphone and preview belong to useRecorder, not this effect.
  }
  try {
    output = canvas.captureStream(30)
    if (!output.getVideoTracks().length) throw new Error('O aparelho não criou a imagem filtrada.')
    animation = requestAnimationFrame(paint)
    return {
      stream: new MediaStream([...output.getVideoTracks(), ...camera.getAudioTracks()]),
      setFilter: (next) => { context.filter = next || 'none' },
      setSource: (next) => { source = next; lastPaint = -Infinity },
      dispose,
    }
  } catch (error) { dispose(); throw error }
}
