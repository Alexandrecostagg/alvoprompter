import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDatabase } from './d1-test-db'
import { deletionHash, processAccountDeletion, recoverAccountDeletions, registerResource, startAccountDeletion, type DeletionEnv } from '../api/transcribe/src/accountDeletion'
import type { AuthUser } from '../api/transcribe/src/saas'

afterEach(() => vi.unstubAllGlobals())
function setup() {
  const data = testDatabase()
  const time = new Date().toISOString()
  for (const uid of ['alice', 'bob']) data.sqlite.prepare('INSERT INTO users(id,email,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid, `${uid}@example.test`, uid, time, time)
  const send = vi.fn(async () => undefined), remove = vi.fn(async () => undefined), cache = new Map<string,string>()
  const env: DeletionEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt', ACCOUNT_DELETION_KEY: btoa('a'.repeat(32)), BILLING_QUEUE: { send } as unknown as Queue, ALVOPROMPT_SYNC: { delete: remove, get: async(key:string)=>cache.get(key)??null, put:async(key:string,value:string)=>{cache.set(key,value)} } as unknown as KVNamespace }
  const user = { uid: 'alice', email: 'alice@example.test', name: 'Alice', emailVerified: true, authTime: Math.floor(Date.now()/1000), tokenExpiresAt: Math.floor(Date.now()/1000)+3600 } as AuthUser
  const request = (body: object = { confirmation: 'EXCLUIR' }) => new Request('https://test.invalid/account', { method: 'DELETE', headers: { Authorization: 'Bearer private-id-token' }, body: JSON.stringify(body) })
  const fetcher = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  return { ...data, env, user, request, send, remove, fetcher }
}
describe('self-service account deletion', () => {
  it('requires exact confirmation, recent authentication and a configured queue', async () => {
    const { env, user, request, sqlite, send } = setup()
    expect((await startAccountDeletion(request({ confirmation: 'yes' }),env,user)).status).toBe(400)
    expect((await startAccountDeletion(request(),env,{...user,authTime:1})).status).toBe(401)
    expect((await startAccountDeletion(request(),{...env,ACCOUNT_DELETION_KEY:undefined},user)).status).toBe(503)
    expect(sqlite.prepare('SELECT count(*) n FROM account_deletions').get()!.n).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
  it('persists an encrypted request before enqueue and recovers queue failure', async () => {
    const { env, user, request, sqlite, send } = setup()
    send.mockRejectedValueOnce(new Error('queue unavailable'))
    expect((await startAccountDeletion(request(),env,user)).status).toBe(202)
    const row = sqlite.prepare('SELECT * FROM account_deletions').get()!
    expect(row.status).toBe('pending'); expect(row.credential_cipher).not.toContain('private-id-token')
    await processAccountDeletion(env,String(row.id))
    const complete = sqlite.prepare('SELECT * FROM account_deletions').get()!
    expect(complete.status).toBe('complete'); expect(complete.user_id).toBeNull(); expect(complete.credential_cipher).toBeNull()
    expect(sqlite.prepare("SELECT id FROM users WHERE id='bob'").get()?.id).toBe('bob')
    expect(sqlite.prepare("SELECT id FROM users WHERE id='alice'").get()).toBeUndefined()
  })
  it('keeps other teams content when the deleted user authored it', async () => {
    const { env, user, request, sqlite } = setup()
    for (const uid of ['alice','bob']) sqlite.prepare('INSERT INTO workspaces(id,name,owner_id,created_at,updated_at) VALUES(?,?,?,?,?)').run(`${uid}-team`,uid,uid,'now','now')
    sqlite.prepare("INSERT INTO workspace_content(workspace_id,collection,key,payload,updated_at,updated_by) VALUES('bob-team','scripts','shared','{}','now','alice')").run()
    const { id } = await (await startAccountDeletion(request(),env,user)).json()
    await processAccountDeletion(env,id)
    expect(sqlite.prepare("SELECT updated_by FROM workspace_content WHERE workspace_id='bob-team'").get()?.updated_by).toBeNull()
    expect(sqlite.prepare("SELECT id FROM workspaces WHERE id='alice-team'").get()).toBeUndefined()
    expect(sqlite.prepare("SELECT id FROM workspaces WHERE id='bob-team'").get()?.id).toBe('bob-team')
  })
  it('does not delete identity or data when billing cancellation fails', async () => {
    const { env, user, request, sqlite, fetcher } = setup()
    sqlite.prepare("INSERT INTO subscriptions(id,user_id,plan,status,asaas_subscription_id,created_at,updated_at) VALUES('sub','alice','creator','active','provider-sub','now','now')").run()
    env.ASAAS_API_BASE='https://api.asaas.com/v3'; env.ASAAS_PRODUCTION_API_KEY='test-only'
    fetcher.mockResolvedValueOnce(new Response('{}',{status:503}))
    const { id } = await (await startAccountDeletion(request(),env,user)).json()
    await expect(processAccountDeletion(env,id)).rejects.toThrow('Billing cancellation pending')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/subscriptions/provider-sub')
    expect(sqlite.prepare("SELECT id FROM users WHERE id='alice'").get()?.id).toBe('alice')
    await processAccountDeletion(env,id)
    expect(sqlite.prepare('SELECT status FROM account_deletions').get()?.status).toBe('complete')
  })
  it('cancels pending checkout with POST before deleting the identity', async () => {
    const { env, user, request, sqlite, fetcher } = setup()
    env.ASAAS_API_BASE='https://api.asaas.com/v3'; env.ASAAS_PRODUCTION_API_KEY='test-only'
    sqlite.prepare("INSERT INTO checkout_sessions(id,user_id,plan,asaas_checkout_id,checkout_url,status,created_at,updated_at) VALUES('checkout','alice','creator','checkout-id','https://asaas.com','pending','now','now')").run()
    const { id } = await (await startAccountDeletion(request(),env,user)).json()
    await processAccountDeletion(env,id)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.asaas.com/v3/checkouts/checkout-id/cancel')
    expect((fetcher.mock.calls[0]![1] as RequestInit).method).toBe('POST')
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('accounts:delete')
  })
  it('expires credentials without deleting data and permits fresh reauthentication', async () => {
    const { env, user, request, sqlite, fetcher } = setup()
    const { id } = await (await startAccountDeletion(request(),env,{...user,tokenExpiresAt:1})).json()
    await processAccountDeletion(env,id)
    expect(sqlite.prepare('SELECT status,credential_cipher FROM account_deletions').get()).toMatchObject({status:'needs_reauth',credential_cipher:null})
    expect(fetcher).not.toHaveBeenCalled()
    expect((await startAccountDeletion(request(),env,user)).status).toBe(202)
    await processAccountDeletion(env,id)
    expect(sqlite.prepare('SELECT status FROM account_deletions').get()?.status).toBe('complete')
  })
  it('cleans only indexed resources, including late resources after completion', async () => {
    const { env, user, request, sqlite, remove } = setup()
    await registerResource(env.DB!,'alice','kv','alice-key'); await registerResource(env.DB!,'bob','kv','bob-key')
    const { id } = await (await startAccountDeletion(request(),env,user)).json()
    await processAccountDeletion(env,id)
    expect(remove.mock.calls.map(args=>args[0])).toEqual(['alice-key'])
    await registerResource(env.DB!,'alice','kv','late-key'); await processAccountDeletion(env,id)
    expect(remove.mock.calls.map(args=>args[0])).toEqual(['alice-key','late-key'])
    expect(sqlite.prepare('SELECT user_id,resource_key FROM account_resources').all()).toEqual([{ user_id:await deletionHash('bob'),resource_key:'bob-key' }])
  })
  it('keeps a retryable job when the data transaction fails after identity deletion', async () => {
    const { env, user, request, sqlite, failNextBatch, fetcher } = setup()
    const { id } = await (await startAccountDeletion(request(),env,user)).json()
    failNextBatch(); await expect(processAccountDeletion(env,id)).rejects.toThrow()
    expect(sqlite.prepare('SELECT status,identity_deleted,credential_cipher FROM account_deletions').get()).toMatchObject({status:'pending',identity_deleted:1,credential_cipher:null})
    await processAccountDeletion(env,id)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(sqlite.prepare('SELECT status FROM account_deletions').get()?.status).toBe('complete')
  })
  it('recovers pending and late cleanup jobs with a bounded cooldown, without a cron',async()=>{
    const {env,user,request,send}=setup()
    const {id}=await(await startAccountDeletion(request(),env,user)).json()
    send.mockClear()
    await recoverAccountDeletions(env); await recoverAccountDeletions(env)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({kind:'account-delete',deletionId:id})
  })
  it('does not set the recovery cooldown when queue delivery fails',async()=>{
    const {env,user,request,send}=setup()
    await startAccountDeletion(request(),env,user)
    send.mockClear(); send.mockRejectedValueOnce(new Error('queue offline'))
    await expect(recoverAccountDeletions(env)).rejects.toThrow('queue offline')
    await recoverAccountDeletions(env)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
