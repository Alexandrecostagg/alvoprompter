import type { VideoEdit } from '../videoProjects'
import { MUSIC_LIBRARY } from '../music'
import { CAPTION_THEMES, MOTION_PRESETS } from './render'

export type VideoStyle = Pick<VideoEdit, 'aspect' | 'exportQuality' | 'burnCaptions' | 'highlightWords' | 'themeKey' | 'motion' | 'musicTrackId' | 'musicVolume' | 'brandFrom' | 'brandTo'>
export function videoStyle(edit: VideoEdit): VideoStyle {
  const { aspect, exportQuality, burnCaptions, highlightWords, themeKey, motion, musicTrackId, musicVolume, brandFrom, brandTo } = edit
  return { aspect, exportQuality: exportQuality ?? 'hd', burnCaptions, highlightWords, themeKey, motion, musicTrackId, musicVolume, brandFrom, brandTo }
}
const key = (scope: string) => `ap.video-style.v1:${scope}`
export function rememberVideoStyle(scope: string, edit: VideoEdit): void {
  try { localStorage.setItem(key(scope), JSON.stringify(videoStyle(edit))) } catch { /* Preferences must not block export. */ }
}
export function previousVideoStyle(scope: string): VideoStyle | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(scope)) ?? 'null') as VideoStyle | null
    if (!value || !['original', '9:16', '4:5', '1:1', '16:9'].includes(value.aspect)
      || !['hd', 'compact'].includes(value.exportQuality ?? '') || typeof value.burnCaptions !== 'boolean' || typeof value.highlightWords !== 'boolean'
      || !CAPTION_THEMES.some(t => t.key === value.themeKey) || !MOTION_PRESETS.some(p => p.value === value.motion)
      || (value.musicTrackId !== null && !MUSIC_LIBRARY.some(t => t.id === value.musicTrackId))
      || !Number.isFinite(value.musicVolume) || value.musicVolume < 0 || value.musicVolume > 1
      || !/^#[\da-f]{6}$/i.test(value.brandFrom) || !/^#[\da-f]{6}$/i.test(value.brandTo)) return null
    return videoStyle(value as VideoEdit)
  } catch { return null }
}
