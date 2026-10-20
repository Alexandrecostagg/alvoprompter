import { describe, expect, it } from 'vitest'
import { acceptStorePolicy, cachedStorePolicy } from './storePolicyCache'
import { updateRequired } from './appPolicy'

const current = { platform: 'ios' as const, minimumBuild: 23, version: '1.6.5', revision: 2 }
function storage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}
describe('native store policy persistence', () => {
  it('preserves a required update offline, isolated by platform', () => {
    const cache = storage()
    acceptStorePolicy(current, 'ios', cache, null)
    expect(updateRequired(cachedStorePolicy('ios', cache), '22')).toBe(true)
    expect(cachedStorePolicy('android', cache)).toBeNull()
  })
  it('rejects stale responses but accepts an explicit administrator rollback', () => {
    const cache = storage()
    expect(acceptStorePolicy({ ...current, minimumBuild: 0, revision: 1 }, 'ios', cache, current)).toEqual(current)
    const rollback = acceptStorePolicy({ ...current, minimumBuild: 0, revision: 3 }, 'ios', cache, current)
    expect(updateRequired(rollback, '22')).toBe(false)
    expect(cachedStorePolicy('ios', cache)?.revision).toBe(3)
  })
  it('handles corrupt, unavailable or full storage without deleting projects', () => {
    const broken = { getItem: () => '{bad', setItem: () => { throw Error('full') } }
    expect(cachedStorePolicy('ios', broken)).toBeNull()
    expect(acceptStorePolicy(current, 'ios', broken, null)).toEqual(current)
    expect(() => acceptStorePolicy({ ...current, minimumBuild: -1 }, 'ios', broken, null)).toThrow('invalid-policy')
    expect(cachedStorePolicy('ios', { ...broken, getItem: () => { throw Error('private') } })).toBeNull()
  })
})
