import { afterEach, expect, it, vi } from 'vitest'
import { preloadable } from './preloadable'
afterEach(() => vi.unstubAllGlobals())
it('shares speculative and actual loading and retries a failed preload', async () => {
  vi.stubGlobal('navigator', {})
  const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('view')
  const module = preloadable(loader)
  module.preload()
  await expect(module.load()).rejects.toThrow('offline')
  expect(await module.load()).toBe('view')
  module.preload()
  expect(loader).toHaveBeenCalledTimes(2)
})
it.each([{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }])('respects connection restrictions while allowing actual navigation: %j', async connection => {
  vi.stubGlobal('navigator', { connection })
  const loader = vi.fn().mockResolvedValue('view')
  const module = preloadable(loader)
  module.preload()
  expect(loader).not.toHaveBeenCalled()
  expect(await module.load()).toBe('view')
})
