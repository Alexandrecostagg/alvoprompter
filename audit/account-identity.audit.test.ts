import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSaaSRequest, type SaaSEnv } from '../api/transcribe/src/saas'
import { testDatabase } from './d1-test-db'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'

const identity = vi.hoisted(() => ({ uid: 'new-user', email: 'person@example.test', verified: true }))
vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'identity-test' }),
  importX509: async () => ({}),
  jwtVerify: async () => ({ payload: { auth_time: 1, sub: identity.uid, email: identity.email, email_verified: identity.verified, name: 'Current user' } }),
}))
beforeEach(() => {
  identity.uid = 'new-user'; identity.email = 'person@example.test'; identity.verified = true
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ 'identity-test': 'certificate' }))))
})
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const data = testDatabase()
  data.sqlite.exec(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES ('old-user','person@example.test','Previous user','2026-09-01','2026-09-01');
    INSERT INTO account_profiles VALUES ('old-user','Previous private profile','11999999999','Private organization','2026-09-01');
    INSERT INTO subscriptions (id,user_id,plan,status,current_period_end,created_at,updated_at) VALUES ('sub-old','old-user','studio','active','2099-01-01','2026','2026');
    INSERT INTO workspaces VALUES ('aabb','Private workspace','old-user','2026','2026');
    INSERT INTO workspace_members VALUES ('member-old','aabb','old-user','person@example.test','Previous user','owner','2026','2026');`)
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt' }
  const request = () => handleSaaSRequest(new Request('https://test.invalid/account', { headers: { Authorization: 'Bearer test' } }), env)
  return { ...data, env, request }
}

describe('Firebase UID ownership with recreated accounts', () => {
  it.each([false, true])('adds contacts without rebuilding users or touching subscriptions (Google schema: %s)', (googleSchema) => {
    const sqlite = new DatabaseSync(':memory:')
    for (const name of readdirSync('api/transcribe/migrations').sort().filter(name => name < (googleSchema ? '0014' : '0013'))) sqlite.exec(readFileSync(`api/transcribe/migrations/${name}`, 'utf8'))
    sqlite.exec(`INSERT INTO users (id,email,name,created_at,updated_at) VALUES ('existing','original@example.test','Existing','2026','2026');
      INSERT INTO subscriptions (id,user_id,plan,status,created_at,updated_at) VALUES ('original-sub','existing','creator','active','2026','2026');
      INSERT INTO workspaces VALUES ('aabb','Original workspace','existing','2026','2026');`)
    const before = sqlite.prepare('SELECT * FROM subscriptions').all()
    sqlite.exec(readFileSync('api/transcribe/migrations/0014_auth_identity_contacts.sql', 'utf8'))
    expect(sqlite.prepare('SELECT id,email,auth_email FROM users').get()).toMatchObject({ id: 'existing', email: 'original@example.test', auth_email: 'original@example.test' })
    expect(sqlite.prepare('SELECT * FROM subscriptions').all()).toEqual(before)
    expect(sqlite.prepare('SELECT owner_id FROM workspaces').get()?.owner_id).toBe('existing')
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    sqlite.close()
  })

  it('loads a recreated account with the same email without granting any previous account data or entitlement', async () => {
    const { request, sqlite } = setup()
    const response = await request()
    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({ user: { uid: 'new-user', email: 'person@example.test' }, profile: null, subscription: { plan: 'free' }, workspaces: [] })
    expect(sqlite.prepare('SELECT user_id,plan,status FROM subscriptions').get()).toMatchObject({ user_id: 'old-user', plan: 'studio', status: 'active' })
    expect(sqlite.prepare("SELECT full_name FROM account_profiles WHERE user_id='old-user'").get()?.full_name).toBe('Previous private profile')
    expect(sqlite.prepare("SELECT count(*) AS n FROM users WHERE id IN ('old-user','new-user')").get()?.n).toBe(2)
  })

  it('supports a Firebase email change without moving ownership or changing another user', async () => {
    const { request, sqlite } = setup()
    await request()
    identity.email = 'changed@example.test'
    expect((await request())?.status).toBe(200)
    identity.uid = 'old-user'; identity.email = 'person@example.test'
    expect(await (await request())?.json()).toMatchObject({ user: { uid: 'old-user', email: 'person@example.test' }, profile: { fullName: 'Previous private profile' }, subscription: { plan: 'studio' } })
    expect(sqlite.prepare("SELECT owner_id FROM workspaces WHERE id='aabb'").get()?.owner_id).toBe('old-user')
  })

  it('keeps verification mandatory on the recreated identity', async () => {
    const { request, env } = setup()
    identity.verified = false
    expect((await request())?.status).toBe(200)
    const response = await handleSaaSRequest(new Request('https://test.invalid/billing/apple/session', { headers: { Authorization: 'Bearer test' } }), env)
    expect(response?.status).toBe(403)
  })

  it('shows real contact email and distinct identities to the administrator', async () => {
    const { request, env } = setup()
    await request()
    identity.uid = 'platform-admin'; identity.email = 'admin@example.test'; env.ADMIN_USER_IDS = identity.uid
    const response = await handleSaaSRequest(new Request('https://test.invalid/admin/overview?q=person%40example.test', { headers: { Authorization: 'Bearer test' } }), env)
    const body = await response?.json() as { users: { id: string; email: string; lastSeenAt: string }[] }
    expect(body.users).toHaveLength(2)
    expect(body.users.every(user => user.email === 'person@example.test')).toBe(true)
    expect(body.users.find(user => user.id === 'new-user')?.lastSeenAt).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('firebase:')
  })
})
