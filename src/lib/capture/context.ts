import { createVideoProject, mediaScope, type VideoProject } from '../videoProjects'
import { useAppStore } from '../../store/useAppStore'
import type { CapturedMovie, CaptureContext } from './types'

export function captureContext(): CaptureContext {
  const state = useAppStore.getState()
  return { id: crypto.randomUUID(), scope: mediaScope(state.mediaOwner, state.cloudWorkspace?.id ?? null), scriptKey: state.currentScript?.key, title: state.currentScript?.title || 'Minha gravação', scriptContent: state.currentScript?.content, createdAt: Date.now() }
}
export function capturedProject(movie: CapturedMovie): VideoProject | undefined {
  if (!movie.context) return
  return { ...movie.context, updatedAt: Date.now(), blob: movie.blob, captureWarning: movie.warning, captureValidation: movie.validation, srt: null, utterances: [] }
}
export async function preserveCapturedMovie(movie: CapturedMovie) {
  const project = capturedProject(movie)
  if (project) await createVideoProject(project)
}
