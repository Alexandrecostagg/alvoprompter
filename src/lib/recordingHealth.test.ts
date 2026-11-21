import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { monitorRecordingCamera } from './recordingHealth'
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function scene() {
  const track = { readyState: 'live', muted: false }
  let next: (() => void) | undefined
  const video = { paused: false, currentTime: 0, play: vi.fn(async () => {}), requestVideoFrameCallback: vi.fn(callback => { next = callback; return 1 }), cancelVideoFrameCallback: vi.fn() } as unknown as HTMLVideoElement
  const fail = vi.fn()
  const stop = monitorRecordingCamera({ getVideoTracks: () => [track] } as unknown as MediaStream, () => video, fail)
  return { fail, stop, video, track, frame: () => next?.() }
}
it('allows an unchanged scene as long as camera frames continue arriving', async () => {
  const s = scene()
  for (let i = 0; i < 70; i++) { await vi.advanceTimersByTimeAsync(500); s.frame() }
  expect(s.fail).not.toHaveBeenCalled()
  s.stop()
  expect(s.video.cancelVideoFrameCallback).toHaveBeenCalled()
})
it('attempts playback recovery then stops once if camera frames cease', async () => {
  const s = scene()
  Object.defineProperty(s.video, 'paused', { value:true })
  await vi.advanceTimersByTimeAsync(7000)
  expect(s.video.play).toHaveBeenCalledTimes(1)
  expect(s.fail).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(5000)
  expect(s.fail).toHaveBeenCalledTimes(1)
})
it('stops a disconnected camera and cleans listeners on explicit stop', async () => {
  const s = scene()
  s.track.readyState = 'ended'
  await vi.advanceTimersByTimeAsync(500)
  expect(s.fail).toHaveBeenCalledOnce()
  const other = scene(); other.stop()
  await vi.advanceTimersByTimeAsync(7000)
  expect(other.fail).not.toHaveBeenCalled()
})
