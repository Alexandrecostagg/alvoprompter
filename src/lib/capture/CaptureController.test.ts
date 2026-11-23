import { afterEach, describe, it, expect, vi } from 'vitest'
import { CaptureController } from './CaptureController'
import type { CameraPort, CapturedMovie } from './types'

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const movie: CapturedMovie = { blob: new Blob(['complete movie'], { type: 'video/mp4' }) }
function fixture() {
  let interrupt!: (reason: string) => void
  const port: CameraPort = { native: true, attach: vi.fn(), open: vi.fn(async callback => { interrupt = callback }), start: vi.fn(async () => {}), stop: vi.fn(async () => movie), close: vi.fn(async () => {}) }
  return { port, controller: new CaptureController(port), interrupt: (reason: string) => interrupt(reason) }
}
afterEach(() => vi.restoreAllMocks())
describe('independent capture owner', () => {
  it('opens once despite repeated renders or permission requests', async () => {
    const { controller, port } = fixture()
    await Promise.all([controller.open(), controller.open(), controller.open()])
    expect(port.open).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().phase).toBe('ready')
  })
  it('starts only once, and ignores start while already recording', async () => {
    const { controller, port } = fixture(); await controller.open()
    expect(await Promise.all([controller.start(), controller.start()])).toEqual([true, false])
    expect(await controller.start()).toBe(false)
    expect(port.start).toHaveBeenCalledTimes(1)
  })
  it('deduplicates stop and closes hardware before publishing the take', async () => {
    const { controller, port } = fixture(); await controller.open(); await controller.start()
    const pending = deferred<CapturedMovie>(); vi.mocked(port.stop).mockReturnValue(pending.promise)
    const states: string[] = []; controller.subscribe(() => states.push(controller.getSnapshot().phase))
    const a = controller.stop(), b = controller.stop()
    expect(a).toBe(b); expect(controller.getSnapshot().phase).toBe('finishing')
    pending.resolve(movie); await a
    expect(port.stop).toHaveBeenCalledTimes(1); expect(port.close).toHaveBeenCalledTimes(1)
    expect(states).toEqual(['finishing', 'idle']); expect(controller.getSnapshot().movie?.blob).toBe(movie.blob)
  })
  it('preserves a completed movie through component cleanup and camera reopen', async () => {
    const { controller } = fixture(); await controller.open(); await controller.start(); await controller.stop(); await controller.close(); await controller.open()
    expect(controller.getSnapshot().movie?.blob).toBe(movie.blob)
  })
  it('keeps the source account and script frozen across asynchronous finishing', async () => {
    const { controller } = fixture(); const context = { id: 'take-id', scope: '["owner","workspace"]', title: 'Frozen title', createdAt: 1 }
    await controller.open(); await controller.start(context); await controller.stop()
    expect(controller.getSnapshot().movie?.context).toEqual(context)
  })
  it('stops and retains the movie on a camera interruption', async () => {
    const { controller, interrupt } = fixture(); await controller.open(); await controller.start()
    interrupt('Camera interrupted'); await controller.stop()
    expect(controller.getSnapshot().movie?.blob).toBe(movie.blob); expect(controller.getSnapshot().warning).toBe('Camera interrupted')
  })
  it('does not leave the UI recording if interruption happens during startup', async () => {
    const { controller, port, interrupt } = fixture(); await controller.open()
    const pending = deferred<void>(); vi.mocked(port.start).mockReturnValue(pending.promise)
    const starting = controller.start(); interrupt('Interrupted while starting'); pending.resolve()
    expect(await starting).toBe(false); await controller.stop()
    expect(controller.getSnapshot().phase).toBe('idle'); expect(controller.getSnapshot().movie?.blob).toBe(movie.blob)
  })
  it('waits for pending startup before cleanup and retains its movie', async () => {
    const { controller, port } = fixture(); await controller.open()
    const pending = deferred<void>(); vi.mocked(port.start).mockReturnValue(pending.promise)
    const starting = controller.start(), closing = controller.close(); pending.resolve(); await starting; await closing
    expect(port.stop).toHaveBeenCalledTimes(1); expect(controller.getSnapshot().movie?.blob).toBe(movie.blob)
    expect(controller.getSnapshot().phase).toBe('idle')
  })
  it('cancels a late permission result before allowing a fresh camera session', async () => {
    const { controller, port } = fixture(); const pending = deferred<void>()
    vi.mocked(port.open).mockReturnValueOnce(pending.promise)
    const opening = controller.open(), closing = controller.close(), reopening = controller.open()
    pending.resolve(); await opening; await closing; await reopening
    expect(port.open).toHaveBeenCalledTimes(2); expect(controller.getSnapshot().phase).toBe('ready')
  })
  it('releases hardware when permission or startup fails and allows explicit retry', async () => {
    const { controller, port } = fixture(); vi.mocked(port.open).mockRejectedValueOnce(new Error('Permission denied'))
    await controller.open(); expect(controller.getSnapshot().error).toBe('Permission denied'); expect(port.close).toHaveBeenCalled()
    await controller.open(); vi.mocked(port.start).mockRejectedValueOnce(new Error('Encoder failed'))
    expect(await controller.start()).toBe(false); expect(controller.getSnapshot().phase).toBe('failed')
    await controller.open(); expect(controller.getSnapshot().phase).toBe('ready')
  })
  it('rejects an empty take without presenting it as a saved video', async () => {
    const { controller, port } = fixture(); vi.mocked(port.stop).mockResolvedValue({ blob: new Blob([]) })
    await controller.open(); await controller.start(); expect(await controller.stop()).toBeNull()
    expect(controller.getSnapshot().phase).toBe('failed'); expect(controller.getSnapshot().movie).toBeNull(); expect(port.close).toHaveBeenCalled()
  })
  it('does not label a very short file as a complete long recording', async () => {
    const { controller, port } = fixture()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    vi.mocked(port.stop).mockResolvedValue({ ...movie, duration: .1 })
    await controller.open(); await controller.start(); clock.mockReturnValue(15000); await controller.stop()
    expect(controller.getSnapshot().movie?.warning).toContain('mais curto')
    expect(controller.getSnapshot().warning).toContain('mais curto')
    expect(controller.getSnapshot().movie?.blob).toBe(movie.blob)
  })
  it('releases the camera even when finalization fails', async () => {
    const { controller, port } = fixture(); vi.mocked(port.stop).mockRejectedValue(new Error('Disk full'))
    await controller.open(); await controller.start(); await controller.stop()
    expect(controller.getSnapshot().error).toBe('Disk full'); expect(port.close).toHaveBeenCalled()
  })
})
