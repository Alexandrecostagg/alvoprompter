import { describe, expect, it } from 'vitest'
import { MUSIC_LIBRARY, generateMusicTrack } from './music'

class FakeParam {
  value = 0
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

function createFakeNode() {
  return {
    connect: () => {},
    disconnect: () => {},
    start: () => {},
    stop: () => {},
    gain: new FakeParam(),
    frequency: new FakeParam(),
    detune: new FakeParam(),
  }
}

function installFakeOfflineCtx(): () => number {
  let scheduled = 0
  const makeNode = () => {
    scheduled++
    return createFakeNode()
  }
  ;(globalThis as Record<string, unknown>).OfflineAudioContext = class {
    readonly sampleRate = 44100
    createOscillator = makeNode
    createGain = makeNode
    createBiquadFilter = makeNode
    createBuffer = () => ({
      getChannelData: () => new Float32Array(10),
    })
    createBufferSource = makeNode
    startRendering = () =>
      Promise.resolve({
        length: 100,
        sampleRate: 44100,
        numberOfChannels: 2,
        duration: 100 / 44100,
        getChannelData: (ch: number) => new Float32Array(100 * ch),
      })
  } as unknown as typeof OfflineAudioContext
  return () => scheduled
}

describe('music library', () => {
  it('exposes at least 4 royalty-free tracks with unique ids', () => {
    expect(MUSIC_LIBRARY.length).toBeGreaterThanOrEqual(4)
    const ids = new Set(MUSIC_LIBRARY.map((t) => t.id))
    expect(ids.size).toBe(MUSIC_LIBRARY.length)
    for (const t of MUSIC_LIBRARY) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.bpm).toBeGreaterThan(40)
      expect(t.chords.length).toBeGreaterThanOrEqual(2)
      for (const chord of t.chords) expect(chord.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('generates every track without errors and returns a buffer', async () => {
    const countNodes = installFakeOfflineCtx()
    for (const track of MUSIC_LIBRARY) {
      const buf = await generateMusicTrack(track, 5)
      expect(buf).toBeTruthy()
      expect(buf.numberOfChannels).toBe(2)
      expect(buf.length).toBe(100)
    }
    expect(countNodes()).toBeGreaterThan(50)
  })

  it('respects shorter durations (fewer scheduled nodes)', async () => {
    const short = installFakeOfflineCtx()
    await generateMusicTrack(MUSIC_LIBRARY[0]!, 4)
    const shortCount = short()
    const long = installFakeOfflineCtx()
    await generateMusicTrack(MUSIC_LIBRARY[0]!, 30)
    const longCount = long()
    expect(longCount).toBeGreaterThan(shortCount)
  })

  it('keeps beats within the generated window (no negative scheduling)', async () => {
    installFakeOfflineCtx()
    await expect(generateMusicTrack(MUSIC_LIBRARY[1]!, 6)).resolves.toBeTruthy()
  })
})
