import { describe, expect, it } from 'vitest'
import worker, { type Env } from '../api/transcribe/src/index'

describe('public video playback after upload', () => {
  it.each(['media:hash', 'hash'])('retrieves the stored object for %s', async (passHash) => {
    const keys: string[] = []
    const env = {
      ALVOPROMPT_SYNC: {
        get: async () => JSON.stringify({ passHash, mediaKey: 'clip.mp4' }),
        put: async () => undefined,
      },
      alvoprompt_media: {
        get: async (key: string) => {
          keys.push(key)
          return key === 'media:hash:clip.mp4'
            ? { body: 'video', httpMetadata: { contentType: 'video/mp4' }, writeHttpMetadata: () => undefined }
            : null
        },
      },
    } as unknown as Env
    const response = await worker.fetch(new Request('https://test.invalid/videopages/00000000-0000-4000-8000-000000000000/play'), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('video')
    expect(keys).toEqual(['media:hash:clip.mp4'])
  })
})
