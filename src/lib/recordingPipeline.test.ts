import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecordingPipeline } from './recordingPipeline'

function setup(decodedFrames = true) {
  const video = { getSettings: () => ({ width: 1280, height: 720 }), stop: vi.fn(), kind: 'video' }
  const audio = { stop: vi.fn(), kind: 'audio' }
  const output = { stop: vi.fn(), kind: 'video' }
  const context = { filter: 'none', drawImage: vi.fn() }
  const capture = vi.fn(() => ({ getVideoTracks: () => [output] }))
  let nextFrame: ((time: number) => void) | undefined
  const source = { muted: false, playsInline: false, autoplay: false, srcObject: null, readyState: 2, play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), ...(decodedFrames ? { requestVideoFrameCallback: vi.fn((callback) => { nextFrame = callback; return 42 }), cancelVideoFrameCallback: vi.fn() } : {}) }
  const canvas = { width: 0, height: 0, getContext: () => context, captureStream: capture }
  vi.stubGlobal('document', { createElement: vi.fn((tag: string) => tag === 'canvas' ? canvas : source) })
  vi.stubGlobal('MediaStream', class { tracks: unknown[]; constructor(tracks: unknown[]) { this.tracks = tracks } })
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { nextFrame = callback; return 43 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const camera = { getVideoTracks: () => [video], getAudioTracks: () => [audio] } as unknown as MediaStream
  return { video, audio, output, context, capture, source, canvas, camera, frame: (time = 0) => nextFrame?.(time) }
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())
describe('stable filtered recording stream', () => {
  it('keeps the same encoder track across filter and intensity changes, preserving audio', () => {
    const scene = setup()
    const pipeline = createRecordingPipeline(scene.camera, 'brightness(1.05)')
    const stream = pipeline.stream
    for (const filter of ['brightness(1.10)', 'brightness(1.10)', null, 'blur(0.4px)']) pipeline.setFilter(filter)
    expect(pipeline.stream).toBe(stream)
    expect(scene.capture).toHaveBeenCalledTimes(1)
    expect(stream).toMatchObject({ tracks: [scene.output, scene.audio] })
    expect(scene.context.filter).toBe('blur(0.4px)')
    expect(scene.output.stop).not.toHaveBeenCalled()
    expect(scene.video.stop).not.toHaveBeenCalled()
    expect(scene.audio.stop).not.toHaveBeenCalled()
    pipeline.dispose()
  })
  it('draws only decoded frames and disposes resources once without stopping the shared microphone', () => {
    const scene = setup()
    const pipeline = createRecordingPipeline(scene.camera, 'brightness(1.05)')
    expect(scene.context.drawImage).not.toHaveBeenCalled()
    scene.frame()
    expect(scene.context.drawImage).toHaveBeenCalledWith(scene.source, 0, 0, 1280, 720)
    pipeline.dispose(); pipeline.dispose(); scene.frame()
    expect(scene.context.drawImage).toHaveBeenCalledTimes(1)
    expect(scene.source.srcObject).toBeNull()
    expect(scene.source.cancelVideoFrameCallback).toHaveBeenCalledWith(42)
    expect(scene.output.stop).toHaveBeenCalledTimes(1)
    expect(scene.audio.stop).not.toHaveBeenCalled()
  })
  it('limits fallback drawing to camera frame rate on high refresh displays', () => {
    const scene = setup(false)
    const pipeline = createRecordingPipeline(scene.camera, 'brightness(1.05)')
    scene.frame(0); scene.frame(8); scene.frame(16); scene.frame(25); scene.frame(34)
    expect(scene.context.drawImage).toHaveBeenCalledTimes(2)
    pipeline.dispose()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(43)
  })
  it('cleans up the decoding video if canvas capture fails', () => {
    const scene = setup()
    scene.capture.mockImplementation(() => { throw new Error('Unsupported') })
    expect(() => createRecordingPipeline(scene.camera, 'brightness(1.05)')).toThrow('Unsupported')
    expect(scene.source.srcObject).toBeNull()
    expect(scene.source.pause).toHaveBeenCalledOnce()
    expect(scene.video.stop).not.toHaveBeenCalled()
  })
})
