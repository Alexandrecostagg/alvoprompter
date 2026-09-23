import type { BeautyPreset } from './types'

export const BEAUTY_PRESETS: Record<
  Exclude<BeautyPreset, 'none'>,
  { blur: number; brightness: number; contrast: number; saturate: number }
> = {
  smooth: { blur: 0.4, brightness: 1.05, contrast: 1.03, saturate: 1.06 },
  classic: { blur: 0.6, brightness: 1.06, contrast: 1.05, saturate: 1.12 },
  glamour: { blur: 0.9, brightness: 1.08, contrast: 1.07, saturate: 1.2 },
}

export const BEAUTY_OPTIONS: { value: BeautyPreset; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'smooth', label: 'Suave' },
  { value: 'classic', label: 'Clássico' },
  { value: 'glamour', label: 'Glamour' },
]

export function beautyFilterCss(preset: BeautyPreset, intensity: number): string | null {
  if (preset === 'none') return null
  const base = BEAUTY_PRESETS[preset]
  const t = Math.max(0, Math.min(1, intensity / 100))
  const parts: string[] = []
  const blur = base.blur * t
  if (blur >= 0.01) parts.push(`blur(${blur.toFixed(2)}px)`)
  parts.push(`brightness(${(1 + (base.brightness - 1) * t).toFixed(3)})`)
  parts.push(`contrast(${(1 + (base.contrast - 1) * t).toFixed(3)})`)
  parts.push(`saturate(${(1 + (base.saturate - 1) * t).toFixed(3)})`)
  return parts.join(' ')
}
