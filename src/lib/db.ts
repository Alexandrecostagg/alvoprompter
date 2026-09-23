import Dexie, { type Table } from 'dexie'
import type { AvatarTwin, ScheduledPost, Script, VoiceProfile, Workspace } from './types'

export function newKey(prefix: string): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function newScriptKey(): string {
  return newKey('s')
}

class AlvoPrompterDB extends Dexie {
  scripts!: Table<Script, number>
  posts!: Table<ScheduledPost, number>
  workspaces!: Table<Workspace, number>
  avatars!: Table<AvatarTwin, number>
  voiceProfiles!: Table<VoiceProfile, number>

  constructor() {
    super('alvoprompt')
    this.version(1).stores({
      scripts: '++id, title, updatedAt',
    })
    this.version(2).stores({
      scripts: '++id, title, updatedAt',
      posts: '++id, scheduledAt, status, updatedAt',
      workspaces: '++id, name, updatedAt',
      avatars: '++id, createdAt',
      voiceProfiles: '++id, createdAt',
    })
    this.version(3).stores({ scripts: '++id, key, title, updatedAt' })
  }
}

export const db = new AlvoPrompterDB()
let contentScope: string | null = null
export function setContentScope(workspaceId: string | null): void { contentScope = workspaceId }
export function getContentScope(): string | null { return contentScope }

export async function getScripts(): Promise<Script[]> {
  return db.scripts.orderBy('updatedAt').reverse().filter((s) => !s.deletedAt && (s.cloudWorkspaceId ?? null) === contentScope).toArray()
}

export async function saveScript(script: Script): Promise<number> {
  return db.transaction('rw', db.scripts, async () => {
    const existing = script.id != null ? await db.scripts.get(script.id)
      : script.key ? await db.scripts.where('key').equals(script.key).first() : undefined
    const next: Script = { ...script, id: existing?.id ?? script.id, key: existing?.key ?? script.key ?? newScriptKey(), updatedAt: script.updatedAt || Date.now(), ...(script.cloudWorkspaceId ? { cloudDirty: true, cloudRevision: script.cloudRevision ?? existing?.cloudRevision ?? 0 } : {}) }
    return db.scripts.put(next)
  })
}

export async function deleteScript(id: number): Promise<void> {
  const row = await db.scripts.get(id)
  if (row?.cloudWorkspaceId) await db.scripts.update(id, { deletedAt: Date.now(), updatedAt: Date.now(), cloudDirty: true })
  else await db.scripts.delete(id)
}

// ---- Agendamentos multi-canal ----
export async function getPosts(): Promise<ScheduledPost[]> {
  return db.posts.orderBy('scheduledAt').filter((p) => !p.deletedAt && (p.cloudWorkspaceId ?? null) === contentScope).toArray()
}

export async function savePost(post: ScheduledPost): Promise<number> {
  const now = Date.now()
  const scope = post.cloudWorkspaceId ?? contentScope
  const next: ScheduledPost = { ...post, key: post.key ?? newKey('p'), updatedAt: now, ...(scope ? { cloudWorkspaceId: scope, cloudDirty: true } : {}) }
  if (next.id != null) {
    await db.posts.put(next)
    return next.id
  }
  return db.posts.add(next)
}

export async function deletePost(id: number): Promise<void> {
  const row = await db.posts.get(id)
  if (row?.cloudWorkspaceId) await db.posts.update(id, { deletedAt: Date.now(), updatedAt: Date.now(), cloudDirty: true })
  else await db.posts.delete(id)
}

// ---- Workspaces de equipe ----
export async function getWorkspaces(): Promise<Workspace[]> {
  return db.workspaces.orderBy('updatedAt').reverse().toArray()
}

export async function saveWorkspace(workspace: Workspace): Promise<number> {
  const now = Date.now()
  const next: Workspace = {
    ...workspace,
    key: workspace.key ?? newKey('w'),
    updatedAt: now,
  }
  if (next.id != null) {
    await db.workspaces.put(next)
    return next.id
  }
  return db.workspaces.add(next)
}

export async function deleteWorkspace(id: number): Promise<void> {
  await db.workspaces.delete(id)
}

// ---- AI Twin: avatares ----
export async function getAvatars(): Promise<AvatarTwin[]> {
  return db.avatars.orderBy('createdAt').reverse().toArray()
}

export async function saveAvatar(avatar: AvatarTwin): Promise<number> {
  const next: AvatarTwin = { ...avatar, key: avatar.key ?? newKey('a') }
  if (next.id != null) {
    await db.avatars.put(next)
    return next.id
  }
  return db.avatars.add(next)
}

export async function deleteAvatar(id: number): Promise<void> {
  await db.avatars.delete(id)
}

// ---- AI Twin: perfis de voz ----
export async function getVoiceProfiles(): Promise<VoiceProfile[]> {
  return db.voiceProfiles.orderBy('createdAt').reverse().toArray()
}

export async function saveVoiceProfile(profile: VoiceProfile): Promise<number> {
  const next: VoiceProfile = { ...profile, key: profile.key ?? newKey('v') }
  if (next.id != null) {
    await db.voiceProfiles.put(next)
    return next.id
  }
  return db.voiceProfiles.add(next)
}

export async function deleteVoiceProfile(id: number): Promise<void> {
  await db.voiceProfiles.delete(id)
}
