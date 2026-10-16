import { describe, expect, it, vi } from 'vitest'
import { createAudioLevelCapture } from './audioLevelCapture'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
function scene() {
  const permission = deferred<MediaStream>()
  const resume = deferred<void>()
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const analyser = { fftSize: 0, smoothingTimeConstant: 0 }
  const context = { state: 'suspended', createMediaStreamSource: () => source, createAnalyser: () => analyser, resume: () => resume.promise, close: vi.fn(async () => {}) }
  const deps = { getUserMedia: vi.fn(() => permission.promise), createContext: vi.fn(() => context as unknown as AudioContext) }
  return { permission, resume, track, stream, source, context, deps }
}

describe('microphone ownership while requests are pending', () => {
  it('closes a permission request that resolves after stop without opening an audio context', async () => {
    const s = scene(), capture = createAudioLevelCapture(s.deps)
    const pending = capture.start()
    capture.stop()
    s.permission.resolve(s.stream)
    expect(await pending).toBeNull()
    expect(s.track.stop).toHaveBeenCalledTimes(1)
    expect(s.deps.createContext).not.toHaveBeenCalled()
  })
  it('deduplicates repeated starts while permission or resume is pending', async () => {
    const s = scene(), capture = createAudioLevelCapture(s.deps)
    const pending = capture.start()
    expect(await capture.start()).toBeNull()
    s.permission.resolve(s.stream)
    await Promise.resolve()
    expect(await capture.start()).toBeNull()
    s.resume.resolve()
    expect((await pending)?.active).toBe(true)
    expect(s.deps.getUserMedia).toHaveBeenCalledTimes(1)
    capture.stop()
  })
  it('immediately stops tracks during a pending resume and disposes only once', async () => {
    const s = scene(), capture = createAudioLevelCapture(s.deps)
    const pending = capture.start()
    s.permission.resolve(s.stream)
    await Promise.resolve()
    capture.stop()
    expect(s.track.stop).toHaveBeenCalledTimes(1)
    expect(s.context.close).toHaveBeenCalledTimes(1)
    s.resume.resolve()
    expect(await pending).toBeNull()
    expect(s.track.stop).toHaveBeenCalledTimes(1)
  })
  it('cleans up stream/context if creating or resuming audio fails', async () => {
    const s = scene(), capture = createAudioLevelCapture(s.deps)
    const pending = capture.start()
    s.permission.resolve(s.stream)
    s.resume.reject(new Error('resume unavailable'))
    await expect(pending).rejects.toThrow('resume unavailable')
    expect(s.track.stop).toHaveBeenCalledOnce()
    expect(s.context.close).toHaveBeenCalledOnce()
    const next = scene()
    next.deps.createContext.mockImplementation(() => { throw new Error('context unavailable') })
    const broken = createAudioLevelCapture(next.deps).start()
    next.permission.resolve(next.stream)
    await expect(broken).rejects.toThrow('context unavailable')
    expect(next.track.stop).toHaveBeenCalledOnce()
  })
  it('does not let a cancelled request close or clear a newer session', async () => {
    const old = scene(), next = scene()
    const deps = { getUserMedia: vi.fn().mockReturnValueOnce(old.permission.promise).mockReturnValueOnce(next.permission.promise), createContext: next.deps.createContext }
    const manager = createAudioLevelCapture(deps)
    const stale = manager.start()
    manager.stop()
    const fresh = manager.start()
    next.permission.resolve(next.stream); next.resume.resolve()
    const active = await fresh
    old.permission.resolve(old.stream)
    expect(await stale).toBeNull()
    expect(active?.active).toBe(true)
    expect(next.track.stop).not.toHaveBeenCalled()
    manager.stop()
    expect(active?.active).toBe(false)
    expect(next.track.stop).toHaveBeenCalledTimes(1)
  })
  it('ignores a permission rejection after cancellation', async () => {
    const s = scene(), manager = createAudioLevelCapture(s.deps)
    const pending = manager.start()
    manager.stop()
    s.permission.reject(new Error('permission denied'))
    expect(await pending).toBeNull()
  })
})
