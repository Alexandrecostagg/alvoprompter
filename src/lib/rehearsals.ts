import { db } from './db'
import type { PrompterSettings } from './types'

export interface Rehearsal {
  scope: string; scriptKey: string; title: string; content: string
  fraction: number; settings: PrompterSettings; updatedAt: number
}
export async function saveRehearsal(session: Rehearsal): Promise<void> {
  if (!session.scriptKey || !session.content.trim() || !Number.isFinite(session.fraction)) throw new Error('Ensaio inválido.')
  await db.rehearsals.put({ ...session, fraction: Math.max(0, Math.min(1, session.fraction)) })
}
export async function getRehearsal(scope: string, scriptKey: string): Promise<Rehearsal | undefined> {
  return db.rehearsals.get([scope, scriptKey])
}
export async function listRehearsals(scope: string): Promise<Rehearsal[]> {
  return (await db.rehearsals.where('scope').equals(scope).toArray()).sort((a,b) => b.updatedAt - a.updatedAt)
}

export interface RehearsalAudio extends Omit<Rehearsal, 'updatedAt'> {
  id: string; createdAt: number; duration: number; type: string
}
export async function saveRehearsalAudio(audio: RehearsalAudio, blob: Blob): Promise<void> {
  if (!audio.id || !audio.scriptKey || !audio.content.trim() || !blob.size || !blob.type.startsWith('audio/') || !Number.isFinite(audio.duration) || audio.duration <= 0 || !Number.isFinite(audio.fraction)) throw new Error('Áudio de ensaio inválido.')
  await db.transaction('rw', db.rehearsalAudios, db.videoSources, async () => {
    await db.videoSources.put({ id: audio.id, blob })
    await db.rehearsalAudios.put({ ...audio, fraction: Math.max(0, Math.min(1, audio.fraction)), type: blob.type })
  })
}
export async function listRehearsalAudios(scope: string): Promise<RehearsalAudio[]> {
  return (await db.rehearsalAudios.where('scope').equals(scope).toArray()).sort((a,b) => b.createdAt - a.createdAt)
}
export async function getRehearsalAudio(scope: string, id: string): Promise<Blob | undefined> {
  const audio = await db.rehearsalAudios.get(id)
  if (!audio || audio.scope !== scope) return undefined
  return (await db.videoSources.get(id))?.blob
}
