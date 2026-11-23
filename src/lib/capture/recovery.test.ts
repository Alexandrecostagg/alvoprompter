import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Filesystem } from '@capacitor/filesystem'
import { db } from '../db'
import { createVideoProject, getVideoProject, updateVideoProject, type VideoEdit } from '../videoProjects'
import { nativeCamera } from './IosCameraPort'
import { recoverNativeTakes } from './recovery'
vi.mock('@capacitor/filesystem', () => ({ Directory: { Library: 'LIBRARY' }, Filesystem: { getUri: vi.fn(async ({path}) => ({ uri: 'file:///current/Library/' + path })), stat: vi.fn(async () => ({ size: 14 })) } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', convertFileSrc: (uri: string) => uri }, registerPlugin: () => ({ pendingTakes: vi.fn(), recoverTake: vi.fn(), acknowledge: vi.fn(async () => {}) }) }))
const scope = '["alice","team"]'
const context = (id: string) => ({ id, scope, title: `Take ${id}`, createdAt: 1 })
beforeEach(async () => {
  await db.videoProjects.clear(); await db.videoSources.clear(); await db.videoVersions.clear()
  vi.mocked(nativeCamera.pendingTakes).mockReset(); vi.mocked(nativeCamera.recoverTake).mockReset(); vi.mocked(nativeCamera.acknowledge).mockClear()
  vi.mocked(nativeCamera.recoverTake).mockResolvedValue({ uri: 'file:///local/movie.mp4', type: 'video/mp4', warning: 'Recovered after interruption' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['original movie']))))
})
afterEach(() => vi.unstubAllGlobals())
it('recovers an interrupted take once with the original scope and warning', async () => {
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('one')] })
  expect(await recoverNativeTakes(scope)).toEqual({ recovered: 1, failed: 0 })
  const project = await getVideoProject('one', scope)
  expect(await project?.blob.text()).toBe('original movie'); expect(project?.captureWarning).toContain('interruption')
  expect(nativeCamera.acknowledge).toHaveBeenCalledWith({ id: 'one', scope })
  expect(await recoverNativeTakes(scope)).toEqual({ recovered: 0, failed: 0 })
  expect(nativeCamera.recoverTake).toHaveBeenCalledTimes(1)
})
it('does not overwrite a saved source, edit or deleted take during recovery', async () => {
  await createVideoProject({ ...context('one'), updatedAt: 1, blob: new Blob(['existing original']), srt: null, utterances: [] })
  const edit = { aspect: '9:16' } as VideoEdit
  await updateVideoProject('one', scope, { edit, deletedAt: 2 })
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('one')] })
  await recoverNativeTakes(scope)
  expect(nativeCamera.recoverTake).not.toHaveBeenCalled(); expect((await db.videoProjects.get('one'))?.edit).toEqual(edit)
  expect((await db.videoProjects.get('one'))?.deletedAt).toBe(2)
})
it('does not import or acknowledge a take from another account', async () => {
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [{ ...context('other'), scope: '["bob",null]' }] })
  await recoverNativeTakes(scope)
  expect(nativeCamera.recoverTake).not.toHaveBeenCalled(); expect(nativeCamera.acknowledge).not.toHaveBeenCalled()
  expect(await db.videoProjects.count()).toBe(0)
})
it('continues recovering other takes if one file is damaged and leaves it pending', async () => {
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('damaged'), context('good')] })
  vi.mocked(nativeCamera.recoverTake).mockRejectedValueOnce(new Error('Unreadable MOV'))
  expect(await recoverNativeTakes(scope)).toEqual({ recovered: 1, failed: 1 })
  expect(nativeCamera.acknowledge).toHaveBeenCalledTimes(1); expect(nativeCamera.acknowledge).toHaveBeenCalledWith({ id: 'good', scope })
  expect(await getVideoProject('good', scope)).toBeDefined()
})
it('does not acknowledge when copying the file into the library fails', async () => {
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('one')] })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
  expect(await recoverNativeTakes(scope)).toEqual({ recovered: 0, failed: 1 })
  expect(nativeCamera.acknowledge).not.toHaveBeenCalled(); expect(await db.videoProjects.count()).toBe(0)
})

it('repairs a missing source without replacing the saved edit or acknowledging a broken copy', async () => {
  await createVideoProject({ ...context('repair'), updatedAt: 1, blob: new Blob(['original']), srt: 'saved captions', utterances: [] })
  const edit = { aspect: '9:16' } as VideoEdit
  await updateVideoProject('repair', scope, { edit })
  await db.videoSources.delete('repair')
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('repair')] })
  expect(await recoverNativeTakes(scope)).toEqual({ recovered: 1, failed: 0 })
  const repaired = await getVideoProject('repair', scope)
  expect(await repaired?.blob.text()).toBe('original movie')
  expect(repaired?.edit).toEqual(edit); expect(repaired?.srt).toBe('saved captions')
  expect(nativeCamera.acknowledge).toHaveBeenCalledWith({ id: 'repair', scope })
})

it('rebases a saved absolute URI to the current app container before copying', async () => {
  vi.mocked(nativeCamera.pendingTakes).mockResolvedValue({ takes: [context('moved')] })
  vi.mocked(nativeCamera.recoverTake).mockResolvedValue({ uri: 'file:///old-container/moved.mp4', type: 'video/mp4' })
  await recoverNativeTakes(scope)
  expect(Filesystem.getUri).toHaveBeenCalledWith({ directory: 'LIBRARY', path: 'Application Support/CameraTakes/moved.mp4' })
  expect(fetch).toHaveBeenCalledWith('file:///current/Library/Application Support/CameraTakes/moved.mp4', expect.objectContaining({ headers: { Range: 'bytes=0-2097151' } }))
})
