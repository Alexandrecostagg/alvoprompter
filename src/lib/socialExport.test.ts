import { describe, expect, it } from 'vitest'
import { exportWarnings, socialDestination, socialFileName, storyRanges, storyFileName } from './socialExport'
const file = { width:1080, height:1920, duration:180, bytes:1_000_000, type:'video/mp4;codecs=avc1.42E01E,mp4a.40.2' }
describe('social export compatibility', () => {
  it('keeps 3-minute Shorts within the boundary and warns above it', () => {
    expect(exportWarnings('shorts',file)).toEqual([])
    expect(exportWarnings('shorts',{...file,duration:180.1}).join()).toContain('3 minutos')
  })
  it('does not label horizontal videos as Shorts',()=>{
    expect(exportWarnings('shorts',{...file,width:1920,height:1080}).join()).toContain('vertical ou quadrado')
  })
  it('warns about Instagram WebM without claiming a renamed extension converts it',()=>{
    expect(exportWarnings('reels',{...file,type:'video/webm'}).join()).toContain('Mudar a extensão não converte')
    expect(exportWarnings('tiktok',{...file,type:'video/webm'})).toEqual([])
  })
  it('rejects empty or unreadable output in the file check',()=>{
    expect(exportWarnings('youtube',{...file,bytes:0}).join()).toContain('novamente')
    expect(exportWarnings('youtube',{...file,duration:Infinity}).join()).toContain('novamente')
  })
  it('preserves actual media extension and destination in exported file names',()=>{
    expect(socialFileName('tiktok','video/webm',new Date('2026-10-21T16:00:00Z'))).toBe('alvoprompter-tiktok-2026-10-21-16-00-00.webm')
    expect(socialFileName('youtube',file.type)).toMatch(/\.mp4$/)
  })
  it('uses a safe custom destination for unknown saved values',()=>{
    expect(socialDestination('untrusted-value').id).toBe('custom')
    expect(socialDestination('youtube').aspect).toBe('16:9')
  })
  it('splits the entire edited timeline without dropping or overlapping a partial last story', () => {
    expect(storyRanges(125)).toEqual([{start:0,end:60},{start:60,end:120},{start:120,end:125}])
    expect(storyRanges(60)).toHaveLength(1)
    expect(storyRanges(32,15)).toEqual([{start:0,end:15},{start:15,end:30},{start:30,end:32}])
    expect(() => storyRanges(Infinity)).toThrow(); expect(() => storyRanges(0)).toThrow(); expect(() => storyRanges(20,0)).toThrow()
    expect(() => storyRanges(500,15)).toThrow('30 partes')
  })
  it('reserves encoder headroom without dropping content at boundaries', () => {
    const ranges = storyRanges(30, 15, .15)
    expect(ranges).toHaveLength(3)
    expect(ranges[0]!.end).toBe(14.85)
    expect(ranges[1]!.start).toBe(ranges[0]!.end)
    expect(ranges.at(-1)!.end).toBe(30)
    expect(storyRanges(.0001)).toHaveLength(1)
  })
  it('keeps story file order, real file extensions and Instagram formats explicit', () => {
    expect(storyFileName(0,12,'video/mp4')).toBe('alvoprompter-story-01-de-12.mp4')
    expect(storyFileName(11,12,'video/webm')).toMatch(/12-de-12.webm$/)
    expect(socialDestination('stories').aspect).toBe('9:16')
    expect(socialDestination('feed-portrait').aspect).toBe('4:5')
    expect(exportWarnings('stories',{...file,type:'video/webm'}).join()).toContain('não converte')
  })
})
