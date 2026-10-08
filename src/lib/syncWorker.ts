import { apiBase } from './cloudflare'
import type { Script } from './types'

const PASS_KEY = 'alvoprompt-sync-pass'

export interface CloudScript {
  key: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export function savedSyncPass(): string | null {
  const current = sessionStorage.getItem(PASS_KEY)
  if (current) return current
  const legacy = localStorage.getItem(PASS_KEY)
  if (!legacy) return null
  sessionStorage.setItem(PASS_KEY, legacy)
  localStorage.removeItem(PASS_KEY)
  return legacy
}

export function saveSyncPass(pass: string): void {
  sessionStorage.setItem(PASS_KEY, pass.trim())
}

export function clearSyncPass(): void {
  sessionStorage.removeItem(PASS_KEY)
  localStorage.removeItem(PASS_KEY)
}

async function syncFetch(init: RequestInit, pass: string, path = '/sync'): Promise<unknown> {
  const token = await (await import('./auth')).getIdToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-sync-pass': pass.trim(),
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Erro ${res.status} ao sincronizar`)
  }
  return res.json()
}

export async function pullFromCloud(pass: string): Promise<CloudScript[]> {
  const payload = (await syncFetch({ method: 'GET' }, pass)) as { scripts: CloudScript[] }
  return payload.scripts
}

export async function pushToCloud(pass: string, scripts: Script[]): Promise<number> {
  const payload = (await syncFetch(
    {
      method: 'PUT',
      body: JSON.stringify({
        scripts: scripts.map((s) => ({
          key: s.key ?? '',
          title: s.title,
          content: s.content,
          tags: s.tags ?? [],
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      }),
    },
    pass,
  )) as { ok: boolean; count: number }
  return payload.count
}

// ---- Sync genérico de coleções (agendamentos, workspaces) ----

export interface SerializablePost {
  key: string
  title: string
  description: string
  channels: string[]
  scheduledAt: number
  status: string
  mediaName?: string
  mediaType?: string
  scriptTitle?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export interface SerializableWorkspace {
  key: string
  name: string
  myRole: string
  members: { name: string; email?: string; role: string }[]
  brandKit?: {
    name: string
    logoDataUrl?: string
    primaryColor: string
    accentColor: string
    fontFamily?: string
  }
  createdAt: number
  updatedAt: number
}

async function pullCollection<T>(pass: string, path: string, field: string): Promise<T[]> {
  const payload = (await syncFetch({ method: 'GET' }, pass, path)) as Record<string, T[]>
  return Array.isArray(payload[field]) ? payload[field] : []
}

async function pushCollection<T>(
  pass: string,
  path: string,
  field: string,
  items: T[],
): Promise<number> {
  const payload = (await syncFetch(
    { method: 'PUT', body: JSON.stringify({ [field]: items }) },
    pass,
    path,
  )) as { ok: boolean; count: number }
  return payload.count
}

export function pullPostsCloud(pass: string): Promise<SerializablePost[]> {
  return pullCollection<SerializablePost>(pass, '/schedules', 'posts')
}

export function pushPostsCloud(pass: string, posts: SerializablePost[]): Promise<number> {
  return pushCollection(pass, '/schedules', 'posts', posts)
}

export function pullWorkspacesCloud(pass: string): Promise<SerializableWorkspace[]> {
  return pullCollection<SerializableWorkspace>(pass, '/workspaces', 'workspaces')
}

export function pushWorkspacesCloud(pass: string, workspaces: SerializableWorkspace[]): Promise<number> {
  return pushCollection(pass, '/workspaces', 'workspaces', workspaces)
}
