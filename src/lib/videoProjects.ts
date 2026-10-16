import { db, newKey } from './db'
import type { CaptionUtterance, SrtSegment } from './srt'
import type { CutHistory } from './editRanges'
import type { CaptionThemeKey, LogoPosition, MotionPreset } from './video/render'

export interface TimedWord { word: string; start: number; end: number }
export interface VideoEdit {
  cuts: CutHistory
  aspect: 'original' | '9:16' | '1:1' | '16:9'
  burnCaptions: boolean; highlightWords: boolean; themeKey: CaptionThemeKey
  segments: SrtSegment[]; alignedWords: TimedWord[]
  logoBlob: Blob | null; logoPosition: LogoPosition; logoWidth: number
  musicBlob: Blob | null; musicTrackId: string | null; musicVolume: number
  motion: MotionPreset; chromaEnabled: boolean; chromaColor: string; chromaSimilarity: number; chromaSmoothness: number; chromaBg: string
  reframe: boolean; eyeContact: boolean
  introEnabled: boolean; introText: string; introSeconds: number
  outroEnabled: boolean; outroText: string; outroSeconds: number
  brandFrom: string; brandTo: string
}
export interface VideoProject {
  id: string; scope: string; scriptKey?: string; title: string
  createdAt: number; updatedAt: number; deletedAt?: number
  blob: Blob; utterances: CaptionUtterance[]; srt: string | null
  edit?: VideoEdit; exportState?: 'rendering' | 'ready' | 'cancelled' | 'failed'
}
export interface VideoVersion { id: string; projectId: string; scope: string; createdAt: number; blob: Blob; edit: VideoEdit }
export type VideoVersionSummary = Omit<VideoVersion, 'blob' | 'edit'>
export type VideoProjectSummary = Omit<VideoProject, 'blob' | 'utterances' | 'srt' | 'edit'>
export const mediaScope = (owner: string | null, workspace: string | null) => JSON.stringify([owner, workspace])

export async function createVideoProject(project: VideoProject): Promise<void> {
  if (!project.blob.size) throw new Error('A gravação está vazia.')
  await db.transaction('rw', db.videoProjects, db.videoSources, async () => {
    const existing = await db.videoProjects.get(project.id)
    if (existing && existing.scope !== project.scope) throw new Error('Gravação de outro espaço.')
    if (!existing) {
      const { blob, ...metadata } = project
      await db.videoProjects.add(metadata)
      await db.videoSources.add({ id: project.id, blob })
    }
  })
}
export async function getVideoProject(id: string, scope: string): Promise<VideoProject | undefined> {
  const row = await db.videoProjects.get(id)
  if (!row || row.scope !== scope || row.deletedAt) return undefined
  const source = await db.videoSources.get(id)
  return source ? { ...row, blob: source.blob } : undefined
}
export async function listVideoProjects(scope: string, trash = false): Promise<VideoProjectSummary[]> {
  return (await db.videoProjects.where('scope').equals(scope).toArray())
    .filter(row => Boolean(row.deletedAt) === trash)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ utterances: _utterances, srt: _srt, edit: _edit, ...summary }) => summary)
}
export async function updateVideoProject(id: string, scope: string, patch: Pick<Partial<VideoProject>, 'edit' | 'exportState' | 'deletedAt'>): Promise<void> {
  await db.transaction('rw', db.videoProjects, async () => {
    const row = await db.videoProjects.get(id)
    if (!row || row.scope !== scope) throw new Error('A gravação não está disponível neste espaço.')
    await db.videoProjects.update(id, { ...patch, updatedAt: Date.now() })
  })
}
export async function saveVideoVersion(projectId: string, scope: string, blob: Blob, edit: VideoEdit): Promise<void> {
  if (!blob.size) throw new Error('O vídeo exportado está vazio.')
  await db.transaction('rw', db.videoProjects, db.videoVersions, db.videoSources, async () => {
    const project = await db.videoProjects.get(projectId)
    if (!project || project.scope !== scope || project.deletedAt) throw new Error('Gravação indisponível.')
    const id = newKey('v')
    await db.videoVersions.add({ id, projectId, scope, createdAt: Date.now(), edit })
    await db.videoSources.add({ id, blob })
    await db.videoProjects.update(projectId, { exportState: 'ready', updatedAt: Date.now() })
  })
}
export async function listVideoVersions(projectId: string, scope: string): Promise<VideoVersionSummary[]> {
  const project = await db.videoProjects.get(projectId)
  if (!project || project.scope !== scope || project.deletedAt) return []
  return (await db.videoVersions.where('projectId').equals(projectId).toArray()).filter(v => v.scope === scope).sort((a, b) => b.createdAt - a.createdAt).map(({ edit: _edit, ...summary }) => summary)
}
export async function getVideoVersion(id: string, scope: string): Promise<VideoVersion | undefined> {
  const version = await db.videoVersions.get(id)
  if (!version || version.scope !== scope) return undefined
  const project = await db.videoProjects.get(version.projectId)
  if (!project || project.scope !== scope || project.deletedAt) return undefined
  const source = await db.videoSources.get(id)
  return source ? { ...version, blob: source.blob } : undefined
}
export function videoStorageError(): string {
  return 'Não foi possível salvar neste aparelho. Baixe o original antes de sair, libere espaço e tente salvar novamente.'
}
