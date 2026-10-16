import { describe, expect, it } from 'vitest'
import { estimateWordTimings, estimateSpeechSegments } from './cuts'

describe('bounded approximate speech timings', () => {
  it('never moves an earlier phrase when a later event arrives', () => {
    const first = { text: 'Uma frase longa que leva tempo para falar', at: 4 }
    const alone = estimateWordTimings([first])
    expect(estimateWordTimings([first, { text: 'Outra frase', at: 4.1 }]).slice(0, alone.length)).toEqual(alone)
  })
  it('does not extend early words beyond their recognition event or before zero', () => {
    const words = estimateWordTimings([{ text: 'Esta é uma frase extensa recebida cedo', at: .1 }])
    expect(words[0]!.start).toBe(0)
    expect(words.at(-1)!.end).toBe(.1)
    expect(words.every(w => w.start >= 0 && w.end <= .1 && w.end > w.start)).toBe(true)
  })
  it('does not overlap phrases or create negative durations from duplicate/invalid events', () => {
    const words = estimateWordTimings([
      { text: 'Primeira frase', at: 2 }, { text: 'Duplicada', at: 2 },
      { text: 'Outra longa frase', at: 2.1 }, { text: 'Inválida', at: -1 },
      { text: 'Inválida', at: Infinity },
    ])
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.end)
    expect(words.at(-1)!.end).toBe(2.1)
  })
  it('offers a phrase review interval ending at recognition instead of a later caption window', () => {
    const [seg] = estimateSpeechSegments([{ text: 'Olá mundo', at: 2 }])
    expect(seg!.start).toBeCloseTo(1.384615)
    expect(seg!.end).toBe(2)
  })
})
