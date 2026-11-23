import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebCameraPort } from './WebCameraPort'
import { CaptureController } from './CaptureController'
vi.mock('../video/integrity', () => ({ inspectMp4: vi.fn(async () => null), BROKEN_VIDEO_MESSAGE: 'broken' }))

class Track extends EventTarget {
  readyState = 'live'
  stop = vi.fn(() => { this.readyState = 'ended' })
}
class Preview {
  muted = false; playsInline = false
  assignments = 0; private source: unknown
  get srcObject() { return this.source }
  set srcObject(value: unknown) { this.assignments++; this.source = value }
  play = vi.fn(async () => {})
  pause = vi.fn()
}
class Encoder {
  static latest: Encoder
  static isTypeSupported = (type: string) => type === 'video/webm'
  state = 'inactive'; mimeType = 'video/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['frames and audio'], { type: this.mimeType }) }); this.onstop?.() }) })
  readonly stream: unknown
  constructor(stream: unknown) { this.stream = stream; Encoder.latest = this }
}
let video: Track, audio: Track, stream: MediaStream, preview: Preview, port: WebCameraPort, documentTarget: EventTarget & { hidden: boolean }, getUserMedia: ReturnType<typeof vi.fn>
beforeEach(() => {
  video = new Track(); audio = new Track(); preview = new Preview()
  stream = { getTracks: () => [video, audio], getVideoTracks: () => [video] } as unknown as MediaStream
  documentTarget = Object.assign(new EventTarget(), { hidden: false })
  getUserMedia = vi.fn(async () => stream)
  vi.stubGlobal('document', documentTarget)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, audioSession: { type: 'auto' } })
  vi.stubGlobal('HTMLVideoElement', Preview); vi.stubGlobal('MediaRecorder', Encoder)
  port = new WebCameraPort(); port.attach(preview as unknown as HTMLElement)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('browser camera port', () => {
  it('records the original stream and never rebuilds it on preview attachment', async () => {
    await port.open(vi.fn()); await port.start()
    for (let i = 0; i < 500; i++) port.attach(preview as unknown as HTMLElement)
    expect(Encoder.latest.stream).toBe(stream); expect(preview.assignments).toBe(1); expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect((navigator as Navigator & { audioSession?: { type: string } }).audioSession?.type).toBe('play-and-record')
    const result = await port.stop(); await port.close()
    expect(result.blob.size).toBeGreaterThan(0); expect(video.stop).toHaveBeenCalledTimes(1); expect(audio.stop).toHaveBeenCalledTimes(1)
    expect((navigator as Navigator & { audioSession?: { type: string } }).audioSession?.type).toBe('playback')
  })
  it('stops streams returned after camera permission was canceled', async () => {
    let resolve!: (value: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>(done => { resolve = done }))
    const opening = port.open(vi.fn()); await port.close(); resolve(stream); await opening
    expect(video.readyState).toBe('ended'); expect(audio.readyState).toBe('ended'); expect(preview.srcObject).toBeNull()
  })
  it('moves preview without creating a second media stream', async () => {
    await port.open(vi.fn()); const second = new Preview(); port.attach(second as unknown as HTMLElement)
    expect(preview.srcObject).toBeNull(); expect(second.srcObject).toBe(stream); expect(getUserMedia).toHaveBeenCalledTimes(1)
    await port.close()
  })
  it('saves available data after unexpected encoder completion and clears hardware', async () => {
    const controller = new CaptureController(port); await controller.open(); await controller.start()
    Encoder.latest.stop(); await new Promise(done => setTimeout(done, 0))
    await controller.stop()
    expect(controller.getSnapshot().phase).toBe('idle'); expect(controller.getSnapshot().movie?.blob.size).toBeGreaterThan(0)
    expect(controller.getSnapshot().warning).toContain('encerrou'); expect(audio.readyState).toBe('ended')
  })
  it('surfaces encoder failures immediately and releases the camera', async () => {
    const controller = new CaptureController(port); await controller.open(); await controller.start()
    Encoder.latest.state = 'inactive'; Encoder.latest.onerror?.()
    await controller.stop()
    expect(controller.getSnapshot().phase).toBe('failed'); expect(controller.getSnapshot().error).toContain('encoder')
    expect(video.readyState).toBe('ended'); expect(audio.readyState).toBe('ended')
  })
  it('preserves a partial recording when a track ends or the page is hidden', async () => {
    const controller = new CaptureController(port); await controller.open(); await controller.start()
    video.dispatchEvent(new Event('ended')); documentTarget.hidden = true; documentTarget.dispatchEvent(new Event('visibilitychange'))
    await controller.stop()
    expect(Encoder.latest.stop).toHaveBeenCalledTimes(1); expect(controller.getSnapshot().movie?.blob.size).toBeGreaterThan(0)
  })
  it('bounds a stalled preview startup and releases its tracks', async () => {
    vi.useFakeTimers(); preview.play.mockReturnValue(new Promise(() => {}))
    const controller = new CaptureController(port); const opening = controller.open()
    await vi.advanceTimersByTimeAsync(10001); await opening
    expect(controller.getSnapshot().phase).toBe('failed'); expect(video.readyState).toBe('ended'); expect(audio.readyState).toBe('ended')
  })
  it('bounds a stalled encoder finalization and makes the error visible', async () => {
    vi.useFakeTimers(); const controller = new CaptureController(port); await controller.open(); await controller.start()
    Encoder.latest.stop.mockImplementation(() => { Encoder.latest.state = 'inactive' })
    const stopping = controller.stop(); await vi.advanceTimersByTimeAsync(15001); await stopping
    expect(controller.getSnapshot().phase).toBe('failed'); expect(controller.getSnapshot().error).toContain('não finalizou')
    expect(video.readyState).toBe('ended'); expect(audio.readyState).toBe('ended')
  })
})
