import type { Script } from './types'

const DRAFTS_KEY = 'alvoprompter-recovery-v1'

export function readDrafts(): Script[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]')
    return Array.isArray(value) ? value.filter((s): s is Script => Boolean(s && typeof s.key === 'string' && typeof s.title === 'string' && typeof s.content === 'string' && Number.isFinite(s.updatedAt))) : []
  } catch { return [] }
}

// Recovery journal closes the debounce/reload gap; IndexedDB is authoritative.
export function journalDraft(script: Script): void {
  const drafts = readDrafts().filter((item) => item.key !== script.key)
  localStorage.setItem(DRAFTS_KEY, JSON.stringify([...drafts, script]))
}

export function clearDraft(script: Script): void {
  const drafts = readDrafts().filter((item) => item.key !== script.key || item.updatedAt > script.updatedAt)
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}
