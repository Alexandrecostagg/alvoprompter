import { Directory, Filesystem } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { nativeCamera } from './IosCameraPort'
import { createVideoProject } from '../videoProjects'
import { db } from '../db'
import { readNativeMovie, type NativeReadProgress } from './readNativeMovie'

/** Import only pending takes for this account/workspace. Keep every native original. */
export async function recoverNativeTakes(scope: string, onProgress?: (progress: NativeReadProgress & { id: string }) => void, onIssue?: (issue: { id: string; message: string; cause?: string }) => void): Promise<{ recovered: number; failed: number }> {
  if (Capacitor.getPlatform() !== 'ios') return { recovered: 0, failed: 0 }
  const { takes } = await nativeCamera.pendingTakes({ scope })
  let recovered = 0, failed = 0
  for (const context of takes) {
    if (context.scope !== scope) continue
    try {
      const existing = await db.videoProjects.get(context.id)
      if (existing && existing.scope !== scope) continue
      const source = existing ? await db.videoSources.get(context.id) : undefined
      if (!source?.blob?.size) {
        const result = await nativeCamera.recoverTake({ id: context.id, scope })
        const extension = result.type === 'video/mp4' ? 'mp4' : 'mov'
        // Resolve inside the current container; absolute iOS paths can change on updates.
        const { uri } = await Filesystem.getUri({ directory: Directory.Library, path: `Application Support/CameraTakes/${context.id}.${extension}` })
        const { size } = await Filesystem.stat({ path: uri })
        const blob = await readNativeMovie({ ...result, uri, bytes: size }, progress => onProgress?.({ ...progress, id: context.id }))
        if (!existing) await createVideoProject({ ...context, updatedAt: Date.now(), blob, srt: null, utterances: [], captureWarning: result.warning, captureValidation: result.validation })
        else await db.transaction('rw', db.videoProjects, db.videoSources, async () => {
          const current = await db.videoProjects.get(context.id)
          if (!current || current.scope !== scope) throw new Error('Gravação de outro espaço.')
          const stored = await db.videoSources.get(context.id)
          if (!stored?.blob?.size) await db.videoSources.put({ id: context.id, blob })
        })
        recovered++
      }
      // Acknowledge only after the database confirms its own durable copy.
      await nativeCamera.acknowledge({ id: context.id, scope })
    } catch (error) {
      failed++
      onIssue?.({ id: context.id, message: error instanceof Error ? error.message : String(error), cause: error instanceof Error && error.cause != null ? String(error.cause) : undefined })
    }
  }
  return { recovered, failed }
}
