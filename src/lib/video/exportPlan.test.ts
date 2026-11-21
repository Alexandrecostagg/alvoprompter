import { describe, expect, it, vi, afterEach } from 'vitest'
import { canReuseOriginal, exportDimensions } from './exportPlan'
import { CAPTION_THEMES, renderVideo, type RenderConfig } from './render'
const source = { width: 720, height: 1280, duration: 97.4 }
const base = (): RenderConfig => ({ sourceBlob: new Blob(['mp4'], { type: 'video/mp4;codecs=avc1' }), sourceInfo: source, preserveOriginal: true, targetWidth: 720, targetHeight: 1280, crop: { sx: 0, sy: 0, sw: 720, sh: 1280 }, keepRanges: [{ start: 0, end: 97.4 }], captions: [], theme: CAPTION_THEMES[0]! })
afterEach(() => vi.unstubAllGlobals())
describe('export without unnecessary encoding', () => {
  it('reuses a complete unedited MP4 immediately without an audio context or decoder', async () => {
    const cfg = base(), onProgress = vi.fn()
    vi.stubGlobal('AudioContext', vi.fn(() => { throw new Error('Must not encode') }))
    expect(await renderVideo({ ...cfg, onProgress })).toBe(cfg.sourceBlob)
    expect(onProgress).toHaveBeenLastCalledWith(1)
    expect(AudioContext).not.toHaveBeenCalled()
  })
  it.each<Partial<RenderConfig>>([
    { preserveOriginal: false }, { targetWidth: 1080 }, { sourceBlob: new Blob(['webm'], { type: 'video/webm' }) },
    { keepRanges: [{ start: 1, end: 97.4 }] }, { keepRanges: [{ start: 0, end: 15 }] },
    { captions: [{ start: 0, end: 3, text: 'Caption' }] }, { motion: 'pan-left' },
    { cropAt: () => base().crop }, { intro: { text: 'Abertura', seconds: 3 } },
    { music: { buffer: {} as AudioBuffer, volume: .3 } },
    { crop: { sx: 2, sy: 0, sw: 718, sh: 1280 } },
  ])('encodes when a requested edit or conversion changes output: %j', patch => {
    expect(canReuseOriginal({ ...base(), ...patch }, source)).toBe(false)
  })
  it('respects cancellation even for an instant export', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(renderVideo({ ...base(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('does not upscale a 720p camera to a 1080p preset, and retains a true HD source', () => {
    expect(exportDimensions({ w: 720, h: 1280 }, { w: 1080, h: 1920 }, false)).toEqual({ width: 720, height: 1280 })
    expect(exportDimensions({ w: 1080, h: 1920 }, { w: 1080, h: 1920 }, false)).toEqual({ width: 1080, height: 1920 })
    expect(exportDimensions({ w: 1080, h: 1920 }, { w: 1080, h: 1920 }, true)).toEqual({ width: 720, height: 1280 })
    expect(exportDimensions({ w: 1280, h: 720 }, { w: 1080, h: 1920 }, false)).toEqual({ width: 404, height: 720 })
  })
})
