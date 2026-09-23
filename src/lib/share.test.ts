import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataUrlToBlob, safeShareFileName, shareVideo } from './share'
afterEach(() => vi.unstubAllGlobals())

describe('social sharing', () => {
  it('creates a safe file name without losing its extension', () => {
    expect(safeShareFileName('Meu vídeo final 01.mp4')).toBe('Meu-video-final-01.mp4')
  })

  it('converts a saved data URL back into a video blob', async () => {
    const blob = dataUrlToBlob('data:video/webm;base64,YWx2bw==')
    expect(blob.type).toBe('video/webm')
    expect(await blob.text()).toBe('alvo')
  })

  it('rejects invalid saved media', () => {
    expect(() => dataUrlToBlob('invalid')).toThrow('formato válido')
  })
  it('downloads the video if the browser advertises sharing but denies it', async () => {
    const click = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('Permission denied', 'NotAllowedError') } })
    vi.stubGlobal('document', { createElement: () => ({ click }) })
    vi.stubGlobal('window', { setTimeout })
    expect(await shareVideo({ blob: new Blob(['video'], {type:'video/webm'}), fileName:'video.webm' })).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })
  it('respects a user canceling the share sheet without downloading', async () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: async () => { throw new DOMException('Canceled', 'AbortError') } })
    await expect(shareVideo({blob:new Blob(['video']),fileName:'video.webm'})).rejects.toMatchObject({name:'AbortError'})
  })
})
