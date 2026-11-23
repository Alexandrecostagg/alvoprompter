import { afterEach, expect, it, vi } from 'vitest'
import { readNativeMovie } from './readNativeMovie'
vi.mock('@capacitor/core', () => ({ Capacitor: { convertFileSrc: (uri: string) => `local:${uri}` } }))
const movie = { uri: 'file:///private/take.mp4', type: 'video/mp4' }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('reassembles bounded iOS ranges, including its unclamped last Content-Range', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('abcd', { status: 206, headers: { 'Content-Range': 'bytes 0-3/6' } })).mockResolvedValueOnce(new Response('ef', { status: 206, headers: { 'Content-Range': 'bytes 4-7/6' } }))
  vi.stubGlobal('fetch', fetcher); const progress = vi.fn()
  const blob = await readNativeMovie(movie, progress, 4)
  expect(await blob.text()).toBe('abcdef'); expect(blob.type).toBe('video/mp4')
  expect(fetcher.mock.calls.map(call => call[1].headers.Range)).toEqual(['bytes=0-3', 'bytes=4-7'])
  expect(progress).toHaveBeenLastCalledWith({ loaded: 6, total: 6, status: 206 })
})
it('accepts a readable native media URLResponse without an HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0, blob: async () => new Blob(['actual movie']) })))
  expect(await (await readNativeMovie(movie)).text()).toBe('actual movie')
})
it('rejects an opaque or empty status-zero body without pretending the original is lost', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0, blob: async () => new Blob([]) })))
  await expect(readNativeMovie(movie)).rejects.toThrow('original está preservado')
})
it('supports a complete response when a handler ignores Range', async () => {
  const fetcher = vi.fn(async () => new Response('whole movie')); vi.stubGlobal('fetch', fetcher)
  expect(await (await readNativeMovie(movie, undefined, 4)).text()).toBe('whole movie'); expect(fetcher).toHaveBeenCalledTimes(1)
})
it('rejects truncated, out-of-order, malformed or changing ranges', async () => {
  for (const [body, range] of [['a', 'bytes 0-3/8'], ['abcd', 'bytes 1-4/8'], ['abcd', 'invalid']]) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 206, headers: { 'Content-Range': range } })))
    await expect(readNativeMovie(movie, undefined, 4)).rejects.toThrow('preservado')
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('abcd', {status:206,headers:{'Content-Range':'bytes 0-3/8'}})).mockResolvedValueOnce(new Response('efgh',{status:206,headers:{'Content-Range':'bytes 4-7/9'}})))
  await expect(readNativeMovie(movie, undefined, 4)).rejects.toThrow('preservado')
})
it('does not reinterpret an HTTP error as a recovered movie', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 404 })))
  await expect(readNativeMovie(movie)).rejects.toThrow('preservado')
})
it('bounds stalled native reads and rejects remote URLs', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))))))
  const pending = readNativeMovie(movie); const assertion = expect(pending).rejects.toThrow('preservado')
  await vi.advanceTimersByTimeAsync(20001); await assertion
  await expect(readNativeMovie({ ...movie, uri: 'https://example.com/video' })).rejects.toThrow('preservado')
})
it('honors range metadata even when a custom scheme has no HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 0, headers: new Headers({ 'Content-Range': 'bytes 0-3/6' }), blob: async () => new Blob(['abcd']) })
    .mockResolvedValueOnce({ ok: false, status: 0, headers: new Headers({ 'Content-Range': 'bytes 4-7/6' }), blob: async () => new Blob(['ef']) }))
  expect(await (await readNativeMovie({ ...movie, bytes: 6 }, undefined, 4)).text()).toBe('abcdef')
})
it('does not accept a partial body as the whole native file when its size is known', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('part')))
  await expect(readNativeMovie({ ...movie, bytes: 100 })).rejects.toThrow('preservado')
})
