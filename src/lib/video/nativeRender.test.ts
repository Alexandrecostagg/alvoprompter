import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  render: vi.fn(), cancel: vi.fn(), remove: vi.fn(), addListener: vi.fn(), stat: vi.fn(), rmdir: vi.fn(), read: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => mocks, Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Library: 'LIBRARY' }, Filesystem: mocks }))
vi.mock('../capture/readNativeMovie', () => ({ readNativeMovie: mocks.read }))
import { CAPTION_THEMES, renderVideo, type RenderConfig } from './render'
import { musicWav } from './nativeRender'

const config = (): RenderConfig => ({ sourceBlob: new Blob(['original'], { type: 'video/mp4' }), nativeSource: { id: 'take', scope: 'workspace' },
  targetWidth: 720, targetHeight: 1280, crop: { sx: 0, sy: 0, sw: 720, sh: 1280 }, keepRanges: [{ start: 90, end: 120 }],
  motion: 'zoom-in', captions: [], theme: CAPTION_THEMES[0]!,
})
beforeEach(() => {
  vi.clearAllMocks(); mocks.stat.mockResolvedValue({ size: 100 }); mocks.rmdir.mockResolvedValue({})
  mocks.addListener.mockResolvedValue({ remove: mocks.remove }); mocks.remove.mockResolvedValue(undefined)
  mocks.cancel.mockResolvedValue(undefined)
  mocks.render.mockResolvedValue({ uri: 'file:///final.mp4', type: 'video/mp4', bytes: 5, validation: { healthy: true } })
  mocks.read.mockResolvedValue(new Blob(['final'], { type: 'video/mp4' }))
})
describe('iPhone offline export', () => {
  it('exports the late cut with zoom without a DOM video or AudioContext, then reads only the checked output', async () => {
    const result = await renderVideo(config())
    expect(result.type).toBe('video/mp4')
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ source: { id: 'take', scope: 'workspace' },
      config: expect.objectContaining({ keepRanges: [{ start: 90, end: 120 }], motion: 'zoom-in' }) }))
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledOnce()
  })
  it('does not publish an output that fails complete-track validation', async () => {
    mocks.render.mockResolvedValue({ bytes: 5, validation: { healthy: false } })
    await expect(renderVideo(config())).rejects.toThrow('conferência')
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalledOnce()
  })
  it('cancels the native job and releases the progress listener', async () => {
    const abort = new AbortController()
    mocks.render.mockImplementation(async () => { abort.abort(); throw new Error('cancelled') })
    await expect(renderVideo({ ...config(), signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.remove).toHaveBeenCalledOnce()
  })
  it('does not start a job if already cancelled', async () => {
    const abort = new AbortController(); abort.abort()
    await expect(renderVideo({ ...config(), signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('preserves stereo music, sample rate and clipped PCM values in a valid WAV', async () => {
    const samples = [new Float32Array([-2, .5]), new Float32Array([2, -.5])]
    const wav = musicWav({ length: 2, numberOfChannels: 2, sampleRate: 48000, getChannelData: (i: number) => samples[i]! } as AudioBuffer)
    const view = new DataView(await wav.arrayBuffer())
    expect(view.getUint16(22, true)).toBe(2); expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint32(40, true)).toBe(8); expect(view.getInt16(44, true)).toBe(-32768); expect(view.getInt16(46, true)).toBe(32767)
  })
})
