import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecordingPipeline, supportsRecordingFilters } from './recordingPipeline'
function setup() {
  const video = { getSettings: () => ({ width: 1280, height: 720 }), stop: vi.fn(), kind: 'video' }
  const audio = { stop: vi.fn(), kind: 'audio' }
  const output = { stop: vi.fn(), kind: 'video' }
  const context = { filter: 'none', drawImage: vi.fn() }
  const capture = vi.fn(() => ({ getVideoTracks: () => [output] }))
  const source = { readyState: 2, srcObject: {}, pause: vi.fn() } as unknown as HTMLVideoElement
  const canvas = { width: 0, height: 0, getContext: () => context, captureStream: capture }
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
  vi.stubGlobal('MediaStream', class { tracks: unknown[]; constructor(tracks: unknown[]) { this.tracks = tracks } })
  let next: ((time: number) => void) | undefined
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { next = callback; return 43 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const camera = { getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream
  return { video, audio, output, context, capture, source, canvas, camera, frame: (time = 0) => next?.(time) }
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())
describe('stable filtered recording stream', () => {
  it('detects missing canvas filter support', () => {
    const scene = setup()
    expect(supportsRecordingFilters()).toBe(true)
    Reflect.deleteProperty(scene.context, 'filter')
    expect(supportsRecordingFilters()).toBe(false)
    expect(scene.capture).not.toHaveBeenCalled()
  })
  it('keeps iPhone capture on the camera track instead of advertising live canvas filters', () => {
    setup()
    vi.stubGlobal('navigator', { userAgent:'iPhone', platform:'iPhone', maxTouchPoints:5 })
    expect(supportsRecordingFilters()).toBe(false)
  })
  it('keeps the same encoder track across effects without creating another video decoder', () => {
    const scene = setup()
    const pipeline = createRecordingPipeline(scene.camera, 'brightness(1.05)', scene.source)
    const stream = pipeline.stream
    for (const filter of ['brightness(1.10)', null, 'blur(0.4px)']) pipeline.setFilter(filter)
    expect(pipeline.stream).toBe(stream)
    expect(scene.capture).toHaveBeenCalledTimes(1)
    expect(stream).toMatchObject({ tracks: [scene.output, scene.audio] })
    expect(document.createElement).toHaveBeenCalledWith('canvas')
    expect(document.createElement).not.toHaveBeenCalledWith('video')
    pipeline.dispose()
    expect(scene.video.stop).not.toHaveBeenCalled()
    expect(scene.audio.stop).not.toHaveBeenCalled()
    expect(scene.source.pause).not.toHaveBeenCalled()
  })
  it('continues past 15 seconds without depending on decoded-frame callback delivery', () => {
    const scene = setup()
    const pipeline = createRecordingPipeline(scene.camera, 'brightness(1.05)', scene.source)
    for (let t = 0; t <= 35000; t += 40) scene.frame(t)
    expect(scene.context.drawImage).toHaveBeenCalledTimes(876)
    const replacement = { readyState: 2 } as HTMLVideoElement
    pipeline.setSource(replacement)
    scene.frame(35040)
    expect(scene.context.drawImage).toHaveBeenLastCalledWith(replacement, 0, 0, 1280, 720)
    pipeline.dispose(); pipeline.dispose(); scene.frame(35080)
    expect(scene.output.stop).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(43)
    expect(scene.context.drawImage).toHaveBeenCalledTimes(877)
  })
  it('limits drawing to camera rate and waits while preview is being reattached', () => {
    const scene = setup()
    const pipeline = createRecordingPipeline(scene.camera, 'none', scene.source)
    scene.frame(0); scene.frame(8); scene.frame(16); scene.frame(25); scene.frame(34)
    expect(scene.context.drawImage).toHaveBeenCalledTimes(2)
    pipeline.setSource(null); scene.frame(68)
    expect(scene.context.drawImage).toHaveBeenCalledTimes(2)
    pipeline.dispose()
  })
  it('does not release the camera when optional canvas capture fails', () => {
    const scene = setup()
    scene.capture.mockImplementation(() => { throw new Error('Unsupported') })
    expect(() => createRecordingPipeline(scene.camera, 'none', scene.source)).toThrow('Unsupported')
    expect(scene.source.srcObject).not.toBeNull()
    expect(scene.source.pause).not.toHaveBeenCalled()
    expect(scene.video.stop).not.toHaveBeenCalled()
  })
})
