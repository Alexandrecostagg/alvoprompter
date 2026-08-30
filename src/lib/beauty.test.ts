import { describe, expect, it } from 'vitest'
import { beautyFilterCss } from './beauty'

describe('beautyFilterCss', () => {
  it('retorna null quando o preset é none', () => {
    expect(beautyFilterCss('none', 60)).toBeNull()
  })

  it('intensidade 0 equivale a nenhum filtro aplicado', () => {
    const css = beautyFilterCss('classic', 0)
    expect(css).toBe('brightness(1.000) contrast(1.000) saturate(1.000)')
  })

  it('intensidade 100 aplica o preset completo com blur', () => {
    const css = beautyFilterCss('glamour', 100)
    expect(css).toContain('blur(0.90px)')
    expect(css).toContain('brightness(1.080)')
    expect(css).toContain('saturate(1.200)')
  })

  it('intensidade média interpola os valores', () => {
    const css = beautyFilterCss('smooth', 50)
    expect(css).toContain('blur(0.20px)')
    expect(css).toContain('brightness(1.025)')
  })

  it('limita a intensidade fora do intervalo', () => {
    expect(beautyFilterCss('smooth', 500)).toContain('brightness(1.050)')
    expect(beautyFilterCss('smooth', -10)).toContain('brightness(1.000)')
  })
})
