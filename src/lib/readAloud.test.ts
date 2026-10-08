import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAloud } from './readAloud'

let spoken: SpeechSynthesisUtterance[]
let synth: { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: ReturnType<typeof vi.fn> }
const callbacks = () => ({ onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })
beforeEach(() => {
  vi.useFakeTimers()
  spoken = []
  synth = { speak: vi.fn((utterance) => spoken.push(utterance)), cancel: vi.fn(), getVoices: vi.fn(() => [{ lang: 'en-US' }, { lang: 'pt-BR' }]) }
  vi.stubGlobal('window', { speechSynthesis: synth, SpeechSynthesisUtterance: class {
    text: string
    constructor(text: string) { this.text = text }
  } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('device read aloud', () => {
  it('starts directly from the tap, chooses Portuguese and reports completion', () => {
    const cb = callbacks()
    readAloud('Olá, vamos ensaiar.', cb)
    expect(spoken).toHaveLength(1)
    expect(spoken[0]?.lang).toBe('pt-BR')
    expect(spoken[0]?.voice?.lang).toBe('pt-BR')
    spoken[0]!.onstart!({} as SpeechSynthesisEvent)
    expect(cb.onStart).toHaveBeenCalledOnce()
    spoken[0]!.onend!({} as SpeechSynthesisEvent)
    expect(cb.onEnd).toHaveBeenCalledOnce()
    vi.runAllTimers()
    expect(cb.onError).not.toHaveBeenCalled()
  })
  it('reads long scripts in order without dropping text', () => {
    const cb = callbacks()
    const content = 'Roteiro para ensaiar com uma pausa. '.repeat(80).trim()
    readAloud(content, cb)
    let index = 0
    while (index < spoken.length) {
      const utterance = spoken[index++]!
      utterance.onstart!({} as SpeechSynthesisEvent)
      utterance.onend!({} as SpeechSynthesisEvent)
    }
    expect(spoken.length).toBeGreaterThan(1)
    expect(spoken.map((item) => item.text).join('')).toBe(content)
    expect(cb.onEnd).toHaveBeenCalledOnce()
  })
  it('cancels queued text and callbacks when leaving the editor', () => {
    const cb = callbacks()
    const stop = readAloud('Texto longo. '.repeat(70), cb)
    stop()
    vi.runAllTimers()
    expect(spoken).toHaveLength(1)
    expect(spoken[0]?.onend).toBeNull()
    expect(cb.onEnd).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
  })
  it('reports a silent startup failure instead of leaving the button busy', () => {
    const cb = callbacks()
    readAloud('Teste', cb)
    vi.advanceTimersByTime(8000)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(synth.cancel).toHaveBeenCalledTimes(2)
  })
  it('reports voice errors without a provider billing message', () => {
    const cb = callbacks()
    readAloud('Teste', cb)
    spoken[0]!.onerror!({} as SpeechSynthesisErrorEvent)
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining('voz do aparelho'))
    vi.runAllTimers()
    expect(cb.onError).toHaveBeenCalledOnce()
  })
})
