import { afterEach, expect, it, vi } from 'vitest'
import { videoPageShareUrl } from './videopage'
const native = vi.hoisted(() => ({ value: true }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }))
afterEach(() => { native.value = true; vi.unstubAllGlobals() })
it.each(['capacitor://localhost','http://localhost'])('builds a public HTTPS link from the native origin %s', origin => {
  vi.stubGlobal('location', { origin, pathname:'/' })
  expect(videoPageShareUrl('my/id')).toBe('https://app.alvoprompter.com.br/?v=my%2Fid')
})
it('keeps the deployed web origin and path', () => {
  native.value = false
  vi.stubGlobal('location', { origin:'https://app.alvoprompter.com.br', pathname:'/' })
  expect(videoPageShareUrl('id')).toBe('https://app.alvoprompter.com.br/?v=id')
})
