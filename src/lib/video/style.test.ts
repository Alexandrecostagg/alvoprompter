import { afterEach, expect, it, vi } from 'vitest'
import { previousVideoStyle, rememberVideoStyle } from './style'
import type { VideoEdit } from '../videoProjects'
afterEach(() => vi.unstubAllGlobals())
it('remembers only style and keeps preferences separate between accounts/workspaces', () => {
  const store = new Map<string,string>()
  vi.stubGlobal('localStorage',{getItem:(key:string)=>store.get(key),setItem:(key:string,value:string)=>store.set(key,value)})
  const edit = { aspect:'9:16',exportQuality:'hd',burnCaptions:true,highlightWords:true,themeKey:'cinema',motion:'pan-left',musicTrackId:'lofi',musicVolume:.3,brandFrom:'#8B5CF6',brandTo:'#22D3EE',introText:'Private title',segments:[{text:'Private speech'}],cuts:{present:[{start:20,end:30}]},musicBlob:new Blob(['private']) } as unknown as VideoEdit
  rememberVideoStyle('account-a/workspace-a',edit)
  expect(previousVideoStyle('account-a/workspace-a')).toMatchObject({aspect:'9:16',motion:'pan-left'})
  expect(previousVideoStyle('account-b/workspace-a')).toBeNull()
  expect([...store.values()][0]).not.toContain('Private')
  expect(previousVideoStyle('account-a/workspace-a')).not.toHaveProperty('cuts')
  expect(previousVideoStyle('account-a/workspace-a')).not.toHaveProperty('musicBlob')
})
it('ignores corrupted preferences and does not prevent exporting with blocked storage', () => {
  vi.stubGlobal('localStorage',{getItem:()=>'{bad',setItem:()=>{throw new Error('Blocked')}})
  expect(previousVideoStyle('scope')).toBeNull()
  expect(()=>rememberVideoStyle('scope',{} as VideoEdit)).not.toThrow()
})
