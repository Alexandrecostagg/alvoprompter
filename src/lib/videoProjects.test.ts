import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createVideoProject, getVideoVersion, getVideoProject, listVideoProjects, listVideoVersions, mediaScope, saveVideoVersion, updateVideoProject, type VideoEdit, type VideoProject } from './videoProjects'
const scope = mediaScope('alice', null)
const project = (): VideoProject => ({ id: 'take-1', scope, scriptKey: 'script-1', title: 'Meu roteiro', createdAt: 1, updatedAt: 1, blob: new Blob(['original']), utterances: [], srt: null })
const edit = { cuts: { past: [[{ start: 0, end: 8 }]], present: [{ start: 2, end: 4 }], future: [] }, aspect: '1:1', segments: [], alignedWords: [] } as unknown as VideoEdit
beforeEach(async () => { await db.videoProjects.clear(); await db.videoSources.clear(); await db.videoVersions.clear() })
describe('recoverable video projects', () => {
  it('preserves original, edit history and association across database reopen', async () => {
    await createVideoProject(project()); await updateVideoProject('take-1', scope, { edit })
    db.close(); await db.open()
    const result = await getVideoProject('take-1', scope)
    expect(await result!.blob.text()).toBe('original'); expect(result?.edit?.cuts).toEqual(edit.cuts); expect(result?.scriptKey).toBe('script-1')
  })
  it('creating the source twice never overwrites a saved edit', async () => {
    await createVideoProject(project()); await updateVideoProject('take-1', scope, { edit }); await createVideoProject(project())
    expect((await getVideoProject('take-1', scope))?.edit).toEqual(edit)
  })
  it('isolates accounts and workspaces on read, write and versions', async () => {
    await createVideoProject(project())
    for (const wrong of [mediaScope('bob', null), mediaScope('alice', 'team'), mediaScope(null, null)]) {
      expect(await listVideoProjects(wrong)).toEqual([]); expect(await getVideoProject('take-1', wrong)).toBeUndefined()
      await expect(updateVideoProject('take-1', wrong, { edit })).rejects.toThrow()
      await expect(saveVideoVersion('take-1', wrong, new Blob(['export']), edit)).rejects.toThrow()
      expect(await listVideoVersions('take-1', wrong)).toEqual([])
    }
  })
  it('moves to trash and restores without losing edits or versions', async () => {
    await createVideoProject(project()); await updateVideoProject('take-1', scope, { edit })
    await saveVideoVersion('take-1', scope, new Blob(['export']), edit)
    await updateVideoProject('take-1', scope, { deletedAt: Date.now() })
    expect(await listVideoProjects(scope)).toEqual([]); expect(await listVideoProjects(scope, true)).toHaveLength(1)
    expect(await getVideoProject('take-1', scope)).toBeUndefined()
    await updateVideoProject('take-1', scope, { deletedAt: undefined })
    expect((await getVideoProject('take-1', scope))?.edit).toEqual(edit)
    const version = await getVideoVersion((await listVideoVersions('take-1', scope))[0]!.id, scope)
    expect(await version!.blob.text()).toBe('export')
  })
  it('retains distinct exports and records an interrupted render without replacing source', async () => {
    await createVideoProject(project()); await saveVideoVersion('take-1', scope, new Blob(['v1']), edit)
    await saveVideoVersion('take-1', scope, new Blob(['v2']), edit)
    await updateVideoProject('take-1', scope, { exportState: 'rendering' })
    const versions = await listVideoVersions('take-1', scope)
    expect(versions).toHaveLength(2)
    expect(versions[0]).not.toHaveProperty('blob')
    expect(await getVideoVersion(versions[0]!.id, mediaScope('bob', null))).toBeUndefined()
    expect((await getVideoProject('take-1', scope))?.exportState).toBe('rendering')
  })
  it('rejects empty media without creating a project or version', async () => {
    await expect(createVideoProject({ ...project(), blob: new Blob() })).rejects.toThrow()
    expect(await listVideoProjects(scope)).toEqual([])
  })
})
