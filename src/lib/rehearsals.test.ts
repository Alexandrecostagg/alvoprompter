import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveRehearsalAudio, listRehearsalAudios, getRehearsalAudio, getRehearsal, listRehearsals, saveRehearsal, type Rehearsal } from './rehearsals'
import { DEFAULT_SETTINGS } from './types'
import { mediaScope } from './videoProjects'
const scope = mediaScope('alice', null)
const session = (): Rehearsal => ({ scope, scriptKey: 'script-a', title: 'Meu ensaio', content: 'Texto original', fraction: .42, settings: { ...DEFAULT_SETTINGS, wpm: 170 }, updatedAt: 1 })
beforeEach(async () => { await db.rehearsals.clear(); await db.rehearsalAudios.clear(); await db.videoSources.clear() })
describe('rehearsal recovery', () => {
  it('recovers the exact text, reading point and settings after closing the database', async () => {
    await saveRehearsal(session()); db.close(); await db.open()
    const recovered = await getRehearsal(scope, 'script-a')
    expect(recovered?.content).toBe('Texto original'); expect(recovered?.fraction).toBe(.42); expect(recovered?.settings.wpm).toBe(170)
  })
  it('keeps account and workspace reading points separate for the same script key', async () => {
    await saveRehearsal(session())
    const team = mediaScope('alice', 'team')
    await saveRehearsal({ ...session(), scope: team, fraction: .8 })
    expect((await getRehearsal(scope, 'script-a'))?.fraction).toBe(.42)
    expect((await getRehearsal(team, 'script-a'))?.fraction).toBe(.8)
    expect(await listRehearsals(mediaScope('bob', null))).toEqual([])
    expect(await getRehearsal(mediaScope(null, null), 'script-a')).toBeUndefined()
  })
  it('updates the saved point rather than duplicating the rehearsal and rejects corrupt positions', async () => {
    await saveRehearsal(session()); await saveRehearsal({ ...session(), fraction: 1, updatedAt: 2 })
    expect(await listRehearsals(scope)).toHaveLength(1)
    await expect(saveRehearsal({ ...session(), fraction: NaN })).rejects.toThrow()
    expect((await getRehearsal(scope, 'script-a'))?.fraction).toBe(1)
  })
})

it('persists separate audio takes with their script snapshots and isolates their blobs', async () => {
  const audio = { ...session(), id: 'voice-1', createdAt: 1, duration: 8, type: 'audio/mp4' }
  await saveRehearsalAudio(audio, new Blob(['voice'], { type: 'audio/mp4' }))
  await saveRehearsalAudio({ ...audio, id: 'voice-2', createdAt: 2 }, new Blob(['second'], { type: 'audio/webm' }))
  db.close(); await db.open()
  expect((await listRehearsalAudios(scope)).map(a => a.id)).toEqual(['voice-2','voice-1'])
  expect((await getRehearsalAudio(scope, 'voice-1'))?.size).toBe(5)
  expect(await getRehearsalAudio(mediaScope('bob', null), 'voice-1')).toBeUndefined()
  await expect(saveRehearsalAudio({ ...audio, id: 'empty' }, new Blob([], { type: 'audio/mp4' }))).rejects.toThrow()
  expect(await db.rehearsalAudios.get('empty')).toBeUndefined()
})
