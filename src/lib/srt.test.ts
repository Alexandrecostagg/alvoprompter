import { describe, expect, it } from 'vitest'
import { groupUtterances } from './srt'
describe('captions used by the video editor', () => {
  it('gives a single recognized utterance a nonzero visible duration', () => {
    expect(groupUtterances([{at:1,text:'Olá, câmera'}])).toEqual([{start:1,end:1.5,text:'Olá, câmera'}])
  })
  it('ignores invalid timestamps and keeps valid spoken text', () => {
    expect(groupUtterances([{at:NaN,text:'Inválido'},{at:0,text:'Olá'}])).toEqual([{start:0,end:0.5,text:'Olá'}])
  })
})
