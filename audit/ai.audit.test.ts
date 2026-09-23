import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, {type Env} from '../api/transcribe/src/index'
import {testDatabase} from './d1-test-db'
vi.mock('jose',()=>({decodeProtectedHeader:()=>({alg:'RS256',kid:'test'}),importX509:async()=>({}),jwtVerify:async()=>({payload:{sub:'user',email:'user@example.test',email_verified:true}})}))
afterEach(()=>vi.unstubAllGlobals())
describe('AI provider and monthly allowance',()=>{
  const run=async(upstream:()=>Promise<Response>,body:unknown={messages:[{role:'user',content:'Roteiro de teste'}]})=>{
    const {db,sqlite}=testDatabase()
    const env={DB:db,FIREBASE_PROJECT_ID:'alvoprompt',AI_PROVIDER:'carcara',AI_MODEL:'Carcara-3.8-27B',CARCARA_API_KEY:'local-test',ALVOPROMPT_SYNC:{get:async()=>null,put:async()=>{}}} as unknown as Env
    vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
      if(String(url).includes('googleapis.com/robot')) return new Response(JSON.stringify({test:'certificate'}))
      expect(JSON.parse(String(init?.body)).model).toBe('Carcara-3.8-27B')
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(8000)
      return upstream()
    }))
    const waiting:Promise<unknown>[]=[]
    const res=await worker.fetch(new Request('https://test.invalid/chat',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body)}),env,{waitUntil:(p:Promise<unknown>)=>waiting.push(p)} as unknown as ExecutionContext)
    await res.text(); await Promise.all(waiting)
    return {status:res.status,used:sqlite.prepare('SELECT ai_actions FROM usage_monthly').get()?.ai_actions}
  }
  it('refunds a provider failure',async()=>expect(await run(async()=>new Response('Unavailable',{status:503}))).toEqual({status:503,used:0}))
  it('refunds an empty stream',async()=>expect(await run(async()=>new Response('data: [DONE]\n\n'))).toEqual({status:200,used:0}))
  it('charges only once when the selected provider returns text',async()=>expect(await run(async()=>new Response('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\ndata: [DONE]\n\n'))).toEqual({status:200,used:1}))
  it('does not consume the monthly quota for an invalid request',async()=>expect(await run(async()=>new Response(''),{})).toEqual({status:400,used:0}))
})
