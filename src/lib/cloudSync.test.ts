import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, saveScript, deleteScript, setContentScope, getScripts } from './db'
import { AccountRequestError, accountFetch } from './saas'
import { syncCloudWorkspace } from './cloudSync'
vi.mock('./saas', () => ({
  AccountRequestError: class extends Error { status: number; constructor(message: string,status: number) {super(message); this.status=status} },
  accountFetch: vi.fn(),
}))
const call = vi.mocked(accountFetch)
const now=Date.now()
const script={key:'key1',title:'Local',content:'Minha edição',createdAt:now,updatedAt:now,cloudWorkspaceId:'team1',cloudRevision:1,cloudDirty:true}
beforeEach(async()=>{ await db.scripts.clear(); await db.posts.clear(); setContentScope('team1'); call.mockReset() })
describe('account-based synchronization',()=>{
  it('uploads a local revision once and keeps other workspaces isolated',async()=>{
    await saveScript(script)
    await saveScript({...script,key:'other',cloudWorkspaceId:'team2'})
    call.mockImplementation(async(_path,init)=>init?.method==='PUT'?{revision:2,updatedAt:new Date(now).toISOString()}:{records:[]})
    await syncCloudWorkspace('team1'); await syncCloudWorkspace('team1')
    expect(call.mock.calls.filter(([,i])=>i?.method==='PUT')).toHaveLength(1)
    expect(await getScripts()).toHaveLength(1)
    expect((await db.scripts.where('key').equals('other').first())?.cloudDirty).toBe(true)
  })
  it('preserves the local edit as a copy when another device changed the same script',async()=>{
    await saveScript(script)
    call.mockImplementation(async(path,init)=>{
      if(init?.method==='PUT') throw new AccountRequestError('Conflito',409)
      return {records:path.endsWith('/scripts')?[{key:'key1',revision:2,deletedAt:null,updatedAt:new Date(now+1).toISOString(),payload:{title:'Remoto',content:'Edição do colega',createdAt:now}}]:[]}
    })
    expect((await syncCloudWorkspace('team1')).conflicts).toBe(1)
    const rows=await getScripts()
    expect(rows.map(r=>r.content).sort()).toEqual(['Edição do colega','Minha edição'].sort())
    expect(rows.find(r=>r.content==='Minha edição')?.cloudDirty).toBe(true)
  })
  it('propagates a tombstone without bringing the deleted script back',async()=>{
    const id=await saveScript(script); await deleteScript(id)
    call.mockImplementation(async(path,init)=>{
      if(init?.method==='PUT') {expect(JSON.parse(String(init.body)).deleted).toBe(true); return {revision:2}}
      return {records:path.endsWith('/scripts')?[{key:'key1',revision:2,deletedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),payload:{}}]:[]}
    })
    await syncCloudWorkspace('team1')
    expect(await getScripts()).toHaveLength(0)
  })
  it('does not mark newer typing synchronized when an older upload finishes',async()=>{
    const id=await saveScript(script)
    call.mockImplementation(async(_path,init)=>{
      if(init?.method==='PUT') { await db.scripts.update(id,{content:'Mais recente',updatedAt:now+100}); return {revision:2} }
      return {records:[]}
    })
    await syncCloudWorkspace('team1')
    expect(await db.scripts.get(id)).toMatchObject({content:'Mais recente',cloudRevision:2,cloudDirty:true})
  })
})
