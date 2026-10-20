import { parsePolicy, type AppPolicy, type StorePlatform } from './appPolicy'

const CACHE_KEY = 'alvoprompter-store-policy-v1'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
export function cachedStorePolicy(platform: StorePlatform, storage: Storage): AppPolicy | null {
  try { return parsePolicy(JSON.parse(storage.getItem(`${CACHE_KEY}:${platform}`) ?? 'null'), platform) } catch { return null }
}
export function acceptStorePolicy(value: unknown, platform: StorePlatform, storage: Storage, current: AppPolicy | null): AppPolicy {
  const next = parsePolicy(value, platform)
  if (!next) throw new Error('invalid-policy')
  if (current && current.revision > next.revision) return current
  try { storage.setItem(`${CACHE_KEY}:${platform}`, JSON.stringify(next)) } catch { /* Cache failure must not break the current session's rule. */ }
  return next
}
