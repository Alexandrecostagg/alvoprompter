import { db, newKey } from './db'
import { accountFetch, AccountRequestError } from './saas'
import type { Script, ScheduledPost } from './types'

export interface CloudRecord<T = Record<string, unknown>> {
  key: string
  payload: T
  revision: number
  deletedAt: string | null
  updatedAt: string
}

export const contentPath = (workspaceId: string, collection: string) => `/account/workspaces/${encodeURIComponent(workspaceId)}/content/${collection}`

export function readCloudContent<T>(workspaceId: string, collection: string): Promise<{ records: CloudRecord<T>[] }> {
  return accountFetch(contentPath(workspaceId, collection))
}

export function writeCloudContent(workspaceId: string, collection: string, key: string, payload: unknown, revision = 0, deleted = false): Promise<{ revision: number; updatedAt: string }> {
  return accountFetch(contentPath(workspaceId, collection), { method: 'PUT', body: JSON.stringify({ key, payload, revision, deleted }) })
}

const running = new Map<string, Promise<{ conflicts: number }>>()
export function syncCloudWorkspace(workspaceId: string): Promise<{ conflicts: number }> {
  const existing = running.get(workspaceId)
  if (existing) return existing
  const task = synchronize(workspaceId).finally(() => running.delete(workspaceId))
  running.set(workspaceId, task)
  return task
}

async function synchronize(workspaceId: string): Promise<{ conflicts: number }> {
  let conflicts = 0
  for (const collection of ['scripts', 'schedules'] as const) {
    const table = collection === 'scripts' ? db.scripts : db.posts
    const dirty = await table.filter((r) => r.cloudWorkspaceId === workspaceId && Boolean(r.cloudDirty)).toArray()
    for (const row of dirty) {
      if (!row.key) continue
      const { id: _id, cloudWorkspaceId: _scope, cloudRevision: _revision, cloudDirty: _dirty, deletedAt: _deleted, ...payload } = row
      // Video stays on its originating device; only planning metadata is shared.
      delete (payload as Partial<ScheduledPost>).mediaDataUrl
      try {
        const result = await writeCloudContent(workspaceId, collection, row.key, payload, row.cloudRevision ?? 0, Boolean(row.deletedAt))
        await db.transaction('rw', table, async () => {
          const current = await table.get(row.id!)
          if (current) await table.put({ ...current, cloudRevision: result.revision, cloudDirty: current.updatedAt !== row.updatedAt } as Script & ScheduledPost)
        })
      } catch (error) {
        if (!(error instanceof AccountRequestError) || error.status !== 409) throw error
        // Preserve concurrent edits as a separate draft before applying the server copy.
        await db.transaction('rw', table, async () => {
          const current = await table.get(row.id!)
          if (!current) return
          if (!current.deletedAt) await table.add({ ...current, id: undefined, key: newKey('conflict'), title: `Cópia em conflito — ${current.title}`, cloudRevision: 0, cloudDirty: true } as Script & ScheduledPost)
          await table.update(row.id!, { cloudDirty: false, cloudRevision: 0 })
        })
        conflicts++
      }
    }
    const remote = await readCloudContent<Script & ScheduledPost>(workspaceId, collection)
    for (const record of remote.records) {
      await db.transaction('rw', table, async () => {
        const current = await table.filter((r) => r.cloudWorkspaceId === workspaceId && r.key === record.key).first()
        if (current?.cloudDirty || (current?.cloudRevision ?? 0) >= record.revision) return
        await table.put({ ...current, ...record.payload, id: current?.id, key: record.key, cloudWorkspaceId: workspaceId, cloudRevision: record.revision, cloudDirty: false, deletedAt: record.deletedAt ? Date.parse(record.deletedAt) : undefined, updatedAt: Date.parse(record.updatedAt) } as Script & ScheduledPost)
      })
    }
  }
  return { conflicts }
}

export async function copyLocalScriptsToWorkspace(workspaceId: string): Promise<number> {
  const scripts = await db.scripts.filter((s) => !s.cloudWorkspaceId && !s.deletedAt).toArray()
  let count = 0
  for (const script of scripts) {
    const key = `${workspaceId}_${script.key ?? script.id}`
    if (await db.scripts.where('key').equals(key).first()) continue
    await db.scripts.add({ ...script, id: undefined, key, cloudWorkspaceId: workspaceId, cloudDirty: true, cloudRevision: 0, updatedAt: Date.now() })
    count++
  }
  return count
}
