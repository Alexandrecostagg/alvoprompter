// Executar: node --experimental-strip-types audit/bigvu-2026-10-16/cuts-probe.mjs
// Importa funções de produção. As duas expressões de seleção são extraídas
// literalmente de VideoEditor.tsx; não monta React nem exporta mídia.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estimateWordTimings, autoCutRanges } from '../../src/lib/cuts.ts'
import { groupUtterances } from '../../src/lib/srt.ts'
import { findFillers } from '../../src/lib/text.ts'

const editor = readFileSync(new URL('../../src/components/editor/VideoEditor.tsx', import.meta.url), 'utf8')
const fillerExpression = editor.match(/setKeepMask\((segments\.map\(\(s\) => findFillers\(s\.text\)\.length === 0\))\)/)?.[1]
assert.ok(fillerExpression, 'Falha explícita caso a implementação de seleção mude')
const selectFillers = new Function('segments', 'findFillers', `return ${fillerExpression}`)
const trimExpression = editor.match(/return (s\.end > action\.from && s\.start < action\.to)/)?.[1]
assert.ok(trimExpression)
const selectTrim = new Function('s', 'action', `return ${trimExpression}`)

const output = { scope: 'Probes determinísticos; não é teste com áudio real ou UI montada.', probes: [] }
function probe(name, input, actual, verify) {
  verify(actual)
  output.probes.push({ name, input, actual, assertion: 'PASS: comportamento atual reproduzido, não aprovação de qualidade' })
}

const phrases = ['Ahn, o produto custa cem reais.', 'Este tipo de câmera tem boa imagem.', 'Eu sei assimilar este conteúdo.']
const fillerSegments = phrases.map((text, i) => ({ start: i * 5, end: i * 5 + 4, text }))
const matches = phrases.map(text => findFillers(text))
probe('Remoção por segmento e falso positivo semântico', fillerSegments,
  { matches, keepMask: selectFillers(fillerSegments, findFillers) },
  actual => {
    assert.deepEqual(actual.keepMask, [false, false, true])
    assert.equal(actual.matches[1][0].removable, false)
  })

const utterances = [{ text: 'Olá mundo', at: 2 }]
probe('Legenda começa no evento final e dura só 0,5 segundo', utterances,
  { words: estimateWordTimings(utterances), captions: groupUtterances(utterances) },
  actual => {
    assert.deepEqual(actual.captions, [{ start: 2, end: 2.5, text: 'Olá mundo' }])
    assert.equal(actual.words.at(-1).end, 2)
    assert.ok(actual.words[0].start > 1)
  })

const first = { text: 'Uma frase longa que leva tempo para falar', at: 4 }
const alone = estimateWordTimings([first])
const followed = estimateWordTimings([first, { text: 'Sim', at: 4.1 }])
probe('Timing da primeira frase depende da chegada da frase seguinte', first,
  { aloneStart: alone.find(w => w.word === 'Uma').start, followedStart: followed.find(w => w.word === 'Uma').start, followedFirstWordEnd: followed.find(w => w.word === 'Uma').end, nextPhraseStart: followed.find(w => w.word === 'Sim').start },
  actual => assert.ok(actual.followedStart - actual.aloneStart > 2))

const early = [{ text: 'Esta é uma frase extensa entregue em um instante muito cedo', at: 0.1 }]
probe('Clamp no início pode empurrar palavras além do instante final', early,
  estimateWordTimings(early), actual => assert.ok(actual.at(-1).end > 3))

const separated = [{ text: 'Primeira fala importante', at: 2 }, { text: 'Ahn, segunda fala', at: 8 }, { text: 'Terceira fala importante', at: 14 }]
const segmented = groupUtterances(separated)
const selected = selectFillers(segmented, findFillers)
const kept = segmented.filter((_, i) => selected[i])
probe('Seleção mantém só janelas das legendas, não o complemento do trecho excluído', separated,
  { segments: segmented, keptRanges: kept, duration: kept.reduce((sum, s) => sum + s.end - s.start, 0) },
  actual => assert.equal(actual.duration, 1))

const trim = { segment: { start: 2, end: 5, text: 'A frase inteira fica' }, action: { from: 3, to: 4 } }
probe('Comando de intervalo seleciona segmento inteiro por interseção', trim,
  { kept: selectTrim(trim.segment, trim.action), exportedSegment: trim.segment },
  actual => assert.equal(actual.kept, true))

const noPausesInside = estimateWordTimings([{ text: 'Olá mundo depois da pausa', at: 8 }])
probe('Nenhuma pausa interna inferida dentro de um resultado de fala', noPausesInside,
  autoCutRanges(noPausesInside, { minSilence: 0.4, pad: 0.06 }),
  actual => assert.equal(actual.length, 1))

console.log(JSON.stringify(output, null, 2))
