import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IosCameraPort, nativeCamera } from './IosCameraPort'
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { stat: vi.fn(async () => ({ size: 15 })) } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { convertFileSrc: (uri: string) => `local:${uri}` }, registerPlugin: () => ({ prepare: vi.fn(async () => {}), setPreview: vi.fn(async () => {}), start: vi.fn(async () => {}), stop: vi.fn(), release: vi.fn(async () => {}), addListener: vi.fn() }) }))
class Observer {
  static latest: Observer
  observe = vi.fn(); disconnect = vi.fn()
  constructor() { Observer.latest = this }
}
const remove = vi.fn(async () => {})
beforeEach(() => {
  vi.clearAllMocks(); remove.mockReset().mockResolvedValue()
  vi.mocked(nativeCamera.addListener).mockReset().mockResolvedValue({ remove })
  vi.stubGlobal('ResizeObserver', Observer); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['native original']))))
})
afterEach(() => vi.unstubAllGlobals())
it('uses the native bridge and forwards the frozen ownership context', async () => {
  const port = new IosCameraPort(); const context = { id: 'unique-take', scope: 'alice', title: 'Title', createdAt: 1 }
  await port.open(vi.fn()); await port.start(context)
  expect(nativeCamera.prepare).toHaveBeenCalledTimes(1); expect(nativeCamera.start).toHaveBeenCalledWith({ id: context.id, context })
  expect(document.documentElement.dataset.nativeCapture).toBe('true'); await port.close()
  expect(document.documentElement.dataset.nativeCapture).toBeUndefined()
})
it('fetches the durable native file exactly once and keeps its original URI', async () => {
  const port = new IosCameraPort(); vi.mocked(nativeCamera.stop).mockResolvedValue({ uri: 'file:///take.mp4', type: 'video/mp4', warning: 'Preserved' })
  const [a, b] = await Promise.all([port.stop(), port.stop()])
  expect(a).toBe(b); expect(a.nativeFile).toBe('file:///take.mp4'); expect(a.blob.type).toBe('video/mp4'); expect(await a.blob.text()).toBe('native original')
  expect(nativeCamera.stop).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1)
})
it('releases native hardware even if removing an event listener fails', async () => {
  const port = new IosCameraPort(); await port.open(vi.fn()); remove.mockRejectedValueOnce(new Error('Listener gone'))
  await port.close(); expect(nativeCamera.release).toHaveBeenCalledTimes(1)
})
it('does not request camera permission if opening was canceled while attaching a listener', async () => {
  let resolve!: (handle: { remove: () => Promise<void> }) => void
  vi.mocked(nativeCamera.addListener).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const port = new IosCameraPort(); const opening = port.open(vi.fn()); await port.close(); resolve({ remove }); await opening
  expect(nativeCamera.prepare).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledTimes(1)
})
it('disconnects layout observers on close and restores observation on explicit reopen', async () => {
  const port = new IosCameraPort(); const element = { getBoundingClientRect: () => ({ x: 1, y: 2, width: 320, height: 200 }) } as HTMLElement
  port.attach(element); await port.open(vi.fn()); const observer = Observer.latest; await port.close()
  expect(observer.disconnect).toHaveBeenCalledTimes(1); await port.open(vi.fn())
  expect(Observer.latest).not.toBe(observer); expect(Observer.latest.observe).toHaveBeenCalledWith(element); await port.close()
})
it('reports a failed local-file fetch without deleting its native source', async () => {
  const port = new IosCameraPort(); vi.mocked(nativeCamera.stop).mockResolvedValue({ uri: 'file:///take.mp4', type: 'video/mp4' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
  await expect(port.stop()).rejects.toThrow('preservado'); await port.close(); expect(nativeCamera.release).toHaveBeenCalled()
})
