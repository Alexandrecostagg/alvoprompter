import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { saveVideo, shareUrl, shareVideo, shareVideoFiles } from './share'
import { Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: vi.fn(async () => ({})), getUri: vi.fn(async ({path}) => ({ uri: 'file:///cache/' + path })) } }))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => ({})) } }))
let output: string | null
beforeEach(() => {
  vi.clearAllMocks()
  output = 'data:video/mp4;codecs=avc1.42001f,mp4a.40.2;base64,YWx2bw=='
  vi.stubGlobal('FileReader', class {
    result: string | null = null
    onload?: () => void
    readAsDataURL() { this.result = output; this.onload?.() }
  })
})
afterEach(() => vi.unstubAllGlobals())
it('writes only base64 despite a comma in the MP4 codec list and shares the local URI', async () => {
  await shareVideo({ blob: new Blob(['alvo'], { type:'video/mp4;codecs=avc1.42001f,mp4a.40.2' }), fileName:'Meu vídeo.mp4' })
  const options = vi.mocked(Filesystem.writeFile).mock.calls[0][0]
  expect(options.data).toBe('YWx2bw==')
  expect(atob(options.data as string)).toBe('alvo')
  expect(options.directory).toBe('CACHE')
  expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.stringContaining('file:///cache/compartilhamentos/')] }))
})
it('uses the corrected base64 extraction for each story part', async () => {
  await shareVideoFiles([{ blob:new Blob(['alvo']), fileName:'1.mp4' }, { blob:new Blob(['alvo']), fileName:'2.mp4' }])
  expect(Filesystem.writeFile).toHaveBeenCalledTimes(2)
  for (const [options] of vi.mocked(Filesystem.writeFile).mock.calls) expect(options.data).toBe('YWx2bw==')
})
it('uses the native file sheet for saving instead of a blob download anchor', async () => {
  expect(await saveVideo({ blob: new Blob(['alvo'], {type:'video/mp4'}), fileName:'editado.mp4' })).toBe('shared')
  expect(Filesystem.writeFile).toHaveBeenCalledOnce()
  expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.stringContaining('editado.mp4')] }))
})
it('shares an actual URL with no video file attached', async () => {
  await shareUrl('Vídeo', 'https://app.alvoprompter.com.br/?v=public')
  expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ url:'https://app.alvoprompter.com.br/?v=public' }))
  expect(Filesystem.writeFile).not.toHaveBeenCalled()
})
it('rejects an empty file or malformed FileReader result before opening native sharing', async () => {
  await expect(shareVideo({blob:new Blob([]),fileName:'empty.mp4'})).rejects.toThrow('vazio')
  output = 'invalid'
  await expect(shareVideo({blob:new Blob(['x']),fileName:'bad.mp4'})).rejects.toThrow('preparar')
  expect(Filesystem.writeFile).not.toHaveBeenCalled()
  expect(Share.share).not.toHaveBeenCalled()
})
