import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRecordingSession } from './recordingSession'

class Encoder {
  static instance: Encoder
  static isTypeSupported = (mime: string) => mime === 'video/mp4'
  mimeType = 'video/mp4'
  state = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive' })
  constructor() { Encoder.instance = this }
  emit(data: string) { this.ondataavailable?.({ data: new Blob([data], { type: this.mimeType }) }) }
}
const track = { readyState: 'live', stop: vi.fn() }
const stream = { getVideoTracks: () => [track] } as unknown as MediaStream
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('MediaRecorder', Encoder); track.stop.mockClear() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('recording completion', () => {
  it('waits for the final asynchronous MP4 data after stop without fragmenting or releasing the camera', async () => {
    const session = startRecordingSession(stream)
    expect(Encoder.instance.start).toHaveBeenCalledWith()
    const done = vi.fn()
    void session.result.then(done)
    Encoder.instance.emit('')
    session.stop(); session.stop()
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    expect(Encoder.instance.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).not.toHaveBeenCalled()
    Encoder.instance.emit('final-video')
    Encoder.instance.onstop?.()
    const blob = await session.result
    expect(await blob.text()).toBe('final-video')
    expect(blob.type).toBe('video/mp4')
  })
  it('reports empty output without substituting any previous recording', async () => {
    const session = startRecordingSession(stream)
    const failure = expect(session.result).rejects.toThrow('não gerou o vídeo')
    session.stop(); Encoder.instance.emit(''); Encoder.instance.onstop?.()
    await failure
  })
  it('keeps earlier chunks when the final chunk is empty', async () => {
    const session = startRecordingSession(stream)
    Encoder.instance.emit('saved-data'); session.stop(); Encoder.instance.emit(''); Encoder.instance.onstop?.()
    expect((await session.result).size).toBe(10)
  })
  it('exposes a recoverable error if the encoder never completes', async () => {
    const session = startRecordingSession(stream)
    const failure = expect(session.result).rejects.toThrow('não terminou de salvar')
    session.stop(); await vi.advanceTimersByTimeAsync(15000); await failure
    expect(Encoder.instance.onstop).toBeNull()
  })
  it('does not start with a disconnected camera', () => {
    expect(() => startRecordingSession({ getVideoTracks: () => [{ readyState: 'ended' }] } as unknown as MediaStream)).toThrow('não está pronta')
  })
})
