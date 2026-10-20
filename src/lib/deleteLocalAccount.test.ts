import 'fake-indexeddb/auto'
import { beforeEach, expect, it, vi } from 'vitest'
import { db } from './db'
import { deleteLocalAccount } from './deleteLocalAccount'
import { journalDraft, readDrafts } from './drafts'
import { createVideoProject, mediaScope } from './videoProjects'

function memoryStorage() {
  const values = new Map<string,string>()
  return { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)} }
}
beforeEach(async () => {
  vi.stubGlobal('localStorage',memoryStorage()); vi.stubGlobal('sessionStorage',memoryStorage())
  for (const table of db.tables) await table.clear()
})
const script = (key:string, workspace?:string) => ({key,title:key,content:'test',createdAt:1,updatedAt:1,cloudWorkspaceId:workspace})
it('removes the departing account media and workspace cache while keeping another account and guest data',async()=>{
  for (const uid of ['alice','bob',null]) await createVideoProject({id:String(uid),scope:mediaScope(uid,null),scriptKey:'script',title:'Video',createdAt:1,updatedAt:1,blob:new Blob(['video']),utterances:[],srt:null})
  await db.scripts.bulkAdd([script('alice-script','alice-team'),script('bob-script','bob-team'),script('guest-script')])
  for (const workspace of ['alice-team','bob-team']) await db.posts.add({title:workspace,description:'test',channels:[],scheduledAt:1,status:'scheduled',createdAt:1,updatedAt:1,cloudWorkspaceId:workspace})
  for (const row of [script('alice-draft','alice-team'),script('bob-draft','bob-team'),script('guest-draft')]) journalDraft(row)
  sessionStorage.setItem('alvoprompt-sync-pass','private-phrase')
  await deleteLocalAccount('alice',['alice-team'],false)
  expect((await db.videoProjects.toArray()).map(p=>p.id).sort()).toEqual(['bob','null'])
  expect((await db.videoSources.toArray()).map(p=>p.id).sort()).toEqual(['bob','null'])
  expect((await db.scripts.toArray()).map(s=>s.key).sort()).toEqual(['bob-script','guest-script'])
  expect((await db.posts.toArray()).map(p=>p.cloudWorkspaceId)).toEqual(['bob-team'])
  expect(readDrafts().map(s=>s.key).sort()).toEqual(['bob-draft','guest-draft'])
  expect(sessionStorage.getItem('alvoprompt-sync-pass')).toBeNull()
})
it('clears every app table and recovery journal only with explicit device erasure',async()=>{
  await db.scripts.add(script('guest')); journalDraft(script('draft'))
  await db.voiceProfiles.add({name:'Voice',samples:[],createdAt:1} as never)
  await deleteLocalAccount('alice',[],true)
  for (const table of db.tables) expect(await table.count()).toBe(0)
  expect(readDrafts()).toEqual([])
})
