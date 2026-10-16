import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareRecordedPlayback, setRecordingAudioMode } from './recordingAudio'

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
  it('reasserts playback after a system mode change on every play/resume', () => {
    const session = { type: 'play-and-record' }
    vi.stubGlobal('navigator', { audioSession: session })
    prepareRecordedPlayback()
    expect(session.type).toBe('playback')
    session.type = 'auto'
    prepareRecordedPlayback()
    expect(session.type).toBe('playback')
  })
  it('does not break playback if reading the optional API throws', () => {
    vi.stubGlobal('navigator', { get audioSession() { throw new Error('Unavailable') } })
    expect(prepareRecordedPlayback).not.toThrow()
  })

})
