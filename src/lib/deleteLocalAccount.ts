import { db } from './db'
import { readDrafts } from './drafts'
import { clearSyncPass } from './syncWorker'

export async function deleteLocalAccount(uid: string, workspaceIds: string[], eraseDevice: boolean): Promise<void> {
  const workspaces = new Set(workspaceIds)
  await db.transaction('rw', db.tables, async () => {
    if (eraseDevice) { for (const table of db.tables) await table.clear(); return }
    const owned = (scope: string) => { try { return JSON.parse(scope)[0] === uid } catch { return false } }
    const projects = (await db.videoProjects.toArray()).filter(p => owned(p.scope))
    const versions = (await db.videoVersions.toArray()).filter(v => owned(v.scope))
    await db.videoSources.bulkDelete([...projects.map(p => p.id), ...versions.map(v => v.id)])
    await db.videoVersions.bulkDelete(versions.map(v => v.id))
    await db.videoProjects.bulkDelete(projects.map(p => p.id))
    const scripts = (await db.scripts.toArray()).filter(s => s.cloudWorkspaceId && workspaces.has(s.cloudWorkspaceId))
    await db.scripts.bulkDelete(scripts.map(s => s.id!))
    const posts = (await db.posts.toArray()).filter(p => p.cloudWorkspaceId && workspaces.has(p.cloudWorkspaceId))
    await db.posts.bulkDelete(posts.map(p => p.id!))
  })
  const drafts = eraseDevice ? [] : readDrafts().filter(s => !s.cloudWorkspaceId || !workspaces.has(s.cloudWorkspaceId))
  localStorage.setItem('alvoprompter-recovery-v1', JSON.stringify(drafts))
  clearSyncPass()
}
