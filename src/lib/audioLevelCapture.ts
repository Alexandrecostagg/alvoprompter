export interface AudioLevelCapture {
  analyser: AnalyserNode
  readonly active: boolean
  dispose(): void
}

/** Owns pending as well as active microphone requests. A cancelled request
 * may still resolve, but its tracks must never become a new live session. */
export function createAudioLevelCapture(deps = {
  getUserMedia: () => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  }),
  createContext: () => new AudioContext(),
}) {
  let generation = 0
  let pending = false
  let current: AudioLevelCapture | null = null
  const stop = () => {
    generation++
    pending = false
    current?.dispose()
    current = null
  }
  const start = async (): Promise<AudioLevelCapture | null> => {
    if (pending || current) return null
    pending = true
    const request = ++generation
    let stream: MediaStream | undefined
    let context: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      try { source?.disconnect() } catch { /* Already disconnected. */ }
      stream?.getTracks().forEach(track => track.stop())
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
    try {
      stream = await deps.getUserMedia()
      if (request !== generation) { dispose(); return null }
      context = deps.createContext()
      source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)
      const capture: AudioLevelCapture = { analyser, get active() { return !disposed }, dispose }
      current = capture
      await context.resume()
      if (request !== generation || !capture.active) { dispose(); return null }
      return capture
    } catch (error) {
      dispose()
      if (request !== generation) return null
      current = null
      throw error
    } finally {
      if (request === generation) pending = false
    }
  }
  return { start, stop }
}
