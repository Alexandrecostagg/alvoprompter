import { describe, expect, it } from 'vitest'
import { parseClipPrompt } from './clipPrompt'

describe('clip prompt parser', () => {
  it('interpreta intervalo e formato em português', () => {
    const result = parseClipPrompt('Pega a parte de 1:30 a 2:15 e deixa em 9:16')
    expect(result.flatMap((item) => item.actions)).toEqual(
      expect.arrayContaining([
        { type: 'aspect', value: '9:16' },
        { type: 'range', from: 90, to: 135 },
      ]),
    )
  })

  it('interpreta cortes, silêncio e legendas', () => {
    const actions = parseClipPrompt('Corte os primeiros 20 segundos, remova o silêncio e adicione legendas')
      .flatMap((item) => item.actions)
    expect(actions).toEqual(expect.arrayContaining([
      { type: 'trim-start', seconds: 20 },
      { type: 'cut-audio' },
      { type: 'captions' },
    ]))
  })

  it('ignora intervalo invertido', () => {
    expect(parseClipPrompt('pega a parte de 2:00 a 1:00')).toHaveLength(0)
  })
  it('preserva segundos fracionários em intervalos e cortes', () => {
    expect(parseClipPrompt('de 3,25 a 4,75').flatMap(r => r.actions)).toContainEqual({ type: 'range', from: 3.25, to: 4.75 })
    expect(parseClipPrompt('corte os primeiros 1,5 segundos').flatMap(r => r.actions)).toContainEqual({ type: 'trim-start', seconds: 1.5 })
  })

})
