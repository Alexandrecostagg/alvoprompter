import { afterEach, describe, expect, it, vi } from 'vitest'
import { setRecordingAudioMode } from './recordingAudio'

afterEach(() => vi.unstubAllGlobals())
describe('recording audio session', () => {
  it('returns to media playback after microphone capture', () => {
    const session = { type: 'auto' }
    vi.stubGlobal('navigator', { audioSession: session })
    setRecordingAudioMode('play-and-record')
    expect(session.type).toBe('play-and-record')
    setRecordingAudioMode('playback')
    expect(session.type).toBe('playback')
  })
  it('works when the optional API is absent or rejects changes', () => {
    vi.stubGlobal('navigator', {})
    expect(() => setRecordingAudioMode('playback')).not.toThrow()
    vi.stubGlobal('navigator', { audioSession: { set type(_value: string) { throw new Error('Unsupported') } } })
    expect(() => setRecordingAudioMode('play-and-record')).not.toThrow()
  })
})
