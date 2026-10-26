import { describe, expect, it } from 'vitest'
import worker from './index'

describe('public legal documents', () => {
  it('serves separate privacy and service terms with the Apple EULA preserved', async () => {
    const privacy = await worker.fetch(new Request('https://example.com/'))
    const terms = await worker.fetch(new Request('https://example.com/terms'))
    expect(privacy.status).toBe(200)
    expect(terms.status).toBe(200)
    const p = await privacy.text()
    const t = await terms.text()
    expect(p).toContain('Resend')
    expect(p).toContain('Finalidades e bases legais')
    expect(p).toContain('Tratamento fora do Brasil')
    expect(t).toContain('itunes/dev/stdeula/')
    expect(t).toContain('não substitui essa licença')
    expect(t).not.toContain('<h1>Política de Privacidade')
    expect(privacy.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })
  it('does not present missing documents as a successful privacy page', async () => {
    expect((await worker.fetch(new Request('https://example.com/missing'))).status).toBe(404)
    expect((await worker.fetch(new Request('https://example.com/terms', { method: 'POST' }))).status).toBe(405)
    const head = await worker.fetch(new Request('https://example.com/terms/', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })
})
