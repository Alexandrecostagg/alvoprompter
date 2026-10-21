import { describe, expect, it } from 'vitest'
import { exportWarnings, socialDestination, socialFileName } from './socialExport'
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
})
