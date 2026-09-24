import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSaaSRequest, type SaaSEnv } from '../api/transcribe/src/saas'
import { testDatabase } from './d1-test-db'
const identity = vi.hoisted(() => ({ uid: 'profile-a' }))
vi.mock('jose', () => ({
  decodeProtectedHeader: () => ({ alg: 'RS256', kid: 'profile-test' }), importX509: async () => ({}),
  jwtVerify: async () => ({ payload: { sub: identity.uid, email: `${identity.uid}@example.test`, email_verified: true, name: 'Original' } }),
}))
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => { identity.uid = 'profile-a'; vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ 'profile-test': 'certificate' })))) })
function setup() {
  const data = testDatabase()
  const env: SaaSEnv = { DB: data.db, FIREBASE_PROJECT_ID: 'alvoprompt' }
  const request = (body?: unknown, token = 'test') => handleSaaSRequest(new Request(`https://test.invalid/account${body === undefined ? '' : '/profile'}`, { method: body === undefined ? 'GET' : 'PATCH', headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env)
  return { ...data, request }
}
const valid = { fullName: '  Ana da Silva  ', phone: '+55 (91) 99999-9999', organization: 'Equipe de conteúdo' }
describe('private account profile', () => {
  it('persists trimmed profile, preserves auth identity, and allows clearing optional fields', async () => {
    const { request } = setup()
    expect((await request(valid))?.status).toBe(200)
    expect(await (await request())?.json()).toMatchObject({ profile: { ...valid, fullName: 'Ana da Silva' }, user: { uid: 'profile-a', name: 'Original' } })
    await request({ ...valid, phone: '', organization: '' })
    expect(await (await request())?.json()).toMatchObject({ profile: { phone: '', organization: '' } })
  })
  it('scopes updates and reads to the authenticated uid, ignoring forged identity fields', async () => {
    const { request } = setup()
    await request({ ...valid, uid: 'profile-b', user_id: 'profile-b', email: 'other@example.test' })
    identity.uid = 'profile-b'
    expect(await (await request())?.json()).toMatchObject({ profile: null })
    await request({ ...valid, fullName: 'Outro usuário' })
    identity.uid = 'profile-a'
    expect(await (await request())?.json()).toMatchObject({ profile: { fullName: 'Ana da Silva' } })
  })
  it('rejects unauthenticated updates', async () => {
    const { request, sqlite } = setup()
    expect((await request(valid, ''))?.status).toBe(401)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM account_profiles').get()?.n).toBe(0)
  })
  it.each([{ ...valid, fullName: '' }, { ...valid, phone: '123' }, { ...valid, organization: 'x'.repeat(101) }, { ...valid, fullName: 'a\nb' }, { ...valid, phone: 123456789 }, []])('rejects invalid data without partial persistence (%j)', async (body) => {
    const { request, sqlite } = setup()
    expect((await request(body))?.status).toBe(400)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM account_profiles').get()?.n).toBe(0)
  })
})
