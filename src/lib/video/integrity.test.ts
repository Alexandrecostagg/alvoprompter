import { expect, it } from 'vitest'
import { inspectMp4 } from './integrity'
const u32 = (...n: number[]) => { const b = new Uint8Array(n.length * 4); const v = new DataView(b.buffer); n.forEach((x,i) => v.setUint32(i*4, x)); return b }
const text = (s: string) => new TextEncoder().encode(s)
const atom = (type: string, ...data: Uint8Array[]) => { const b = new Uint8Array(8 + data.reduce((n,a) => n+a.length,0)); b.set(u32(b.length)); b.set(text(type),4); let p=8; for (const a of data) { b.set(a,p); p+=a.length } return b }
function track(type: 'vide'|'soun', seconds: number, gap = 0) {
  const timing = gap ? u32(0, 2, 450, 1, 1, gap * 30) : u32(0, 1, seconds * 30, 1)
  return atom('trak', atom('mdia', atom('mdhd', u32(0,0,0,30,seconds*30)), atom('hdlr',u32(0,0),text(type)), atom('minf',atom('stbl',atom('stts',timing)))))
}
function file(video = 97, audio = 97, gap = 0) { return new Blob([atom('ftyp',text('isom0000')),atom('mdat',new Uint8Array(128)),atom('moov', track('vide',video,gap), track('soun',audio))],{type:'video/mp4'}) }
it('rejects the reported 15s image / 97s audio mismatch', async () => {
  expect(await inspectMp4(file(15,97))).toMatchObject({ videoSeconds:15, audioSeconds:97, problem:true })
})
it('accepts synchronized tracks, including small encoder audio padding', async () => {
  expect(await inspectMp4(file(97,98))).toMatchObject({ problem:false })
})
it('detects a held frame even when track durations reach the same end', async () => {
  expect(await inspectMp4(file(97,97,82))).toMatchObject({ videoSeconds:97, longestFrameSeconds:82, problem:true })
})
it('does not guess for malformed, unsupported, or fragmented media', async () => {
  expect(await inspectMp4(new Blob(['not mp4'],{type:'video/mp4'}))).toBeNull()
  expect(await inspectMp4(new Blob(['webm'],{type:'video/webm'}))).toBeNull()
  expect(await inspectMp4(new Blob([atom('moov',track('vide',0))],{type:'video/mp4'}))).toBeNull()
})
it('cancels before reading a large file', async () => {
  const controller = new AbortController(); controller.abort()
  await expect(inspectMp4(file(),controller.signal)).rejects.toMatchObject({name:'AbortError'})
})
