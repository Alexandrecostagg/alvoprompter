import type { RenderConfig } from './render'

export interface SourceVideoInfo { width: number; height: number; duration: number }

/** Do not enlarge camera pixels just to reach a social preset's maximum size. */
export function exportDimensions(source: { w: number; h: number }, target: { w?: number; h?: number }, compact: boolean) {
  const w = target.w ?? source.w
  const h = target.h ?? source.h
  const scale = Math.min(1, source.w / w, source.h / h, compact ? 1280 / Math.max(w, h) : 1)
  return { width: Math.max(2, Math.floor(w * scale / 2) * 2), height: Math.max(2, Math.floor(h * scale / 2) * 2) }
}

/** Reuse bytes only when the requested output has no observable edits. */
export function canReuseOriginal(cfg: RenderConfig, source: SourceVideoInfo): boolean {
  const range = cfg.keepRanges[0]
  return cfg.preserveOriginal === true && cfg.sourceBlob.type.split(';')[0] === 'video/mp4'
    && source.width > 0 && source.height > 0 && Number.isFinite(source.duration) && source.duration > 0
    && cfg.targetWidth === source.width && cfg.targetHeight === source.height
    && cfg.keepRanges.length === 1 && !!range && range.start === 0 && Math.abs(range.end - source.duration) < .002
    && cfg.crop.sx === 0 && cfg.crop.sy === 0 && cfg.crop.sw === source.width && cfg.crop.sh === source.height
    && !cfg.cropAt && (!cfg.motion || cfg.motion === 'none') && !cfg.chroma && !cfg.logo && !cfg.music
    && !cfg.intro && !cfg.outro && (cfg.theme.key === 'none' || cfg.captions.length === 0)
}
