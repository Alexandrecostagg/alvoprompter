import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBillingAvailability } from './billing'
vi.mock('./cloudflare', () => ({ apiBase: () => 'https://test.invalid' }))
afterEach(() => vi.unstubAllGlobals())
describe('billing availability', () => {
  it('reports unavailable billing before a paid plan can be chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ billing: { configured: false, sandbox: true } }))))
    expect(await loadBillingAvailability()).toEqual({ configured: false, sandbox: true })
  })
  it('distinguishes sandbox from real billing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ billing: { configured: true, sandbox: false } }))))
    expect(await loadBillingAvailability()).toEqual({ configured: true, sandbox: false })
  })
  it.each([new Response('{}'), new Response('Unavailable', { status: 503 })])('fails closed on missing status or server failure', async (response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(loadBillingAvailability()).rejects.toThrow('Não foi possível verificar')
  })
})
