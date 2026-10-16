import type { RenderRange } from './video/render'
import type { ClipPromptAction } from './clipPrompt'

/** Canonical intervals on the original video's timeline. */
export function normalizeRanges(ranges: RenderRange[], duration: number): RenderRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const sorted = ranges.filter(r => Number.isFinite(r.start) && Number.isFinite(r.end))
    .map(r => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) }))
    .filter(r => r.end > r.start).sort((a, b) => a.start - b.start)
  const result: RenderRange[] = []
  for (const r of sorted) {
    const last = result.at(-1)
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else result.push({ ...r })
  }
  return result
}

export function intersectRanges(a: RenderRange[], b: RenderRange[], duration: number): RenderRange[] {
  return normalizeRanges(a.flatMap(x => b.map(y => ({
    start: Math.max(x.start, y.start), end: Math.min(x.end, y.end),
  }))), duration)
}

export function removeRange(ranges: RenderRange[], cut: RenderRange, duration: number): RenderRange[] {
  const valid = normalizeRanges([cut], duration)[0]
  if (!valid) return normalizeRanges(ranges, duration)
  return normalizeRanges(ranges.flatMap(r => r.end <= valid.start || r.start >= valid.end ? [r] : [
    { start: r.start, end: Math.min(r.end, valid.start) },
    { start: Math.max(r.start, valid.end), end: r.end },
  ]), duration)
}

export function applyTimeCut(ranges: RenderRange[], action: ClipPromptAction, duration: number): RenderRange[] {
  if (action.type === 'range') return intersectRanges(ranges, [{ start: action.from, end: action.to }], duration)
  if (action.type === 'trim-start') return removeRange(ranges, { start: 0, end: action.seconds }, duration)
  if (action.type === 'trim-end') return removeRange(ranges, { start: duration - action.seconds, end: duration }, duration)
  return ranges
}

export interface CutHistory { past: RenderRange[][]; present: RenderRange[]; future: RenderRange[][] }
export type CutAction = { type: 'hydrate'; history: CutHistory } | { type: 'reset' | 'apply'; ranges: RenderRange[] } | { type: 'undo' | 'redo' }
export const emptyCutHistory: CutHistory = { past: [], present: [], future: [] }
export function cutHistoryReducer(state: CutHistory, action: CutAction): CutHistory {
  if (action.type === 'hydrate') return action.history
  if (action.type === 'reset') return { past: [], present: action.ranges, future: [] }
  if (action.type === 'apply') {
    if (JSON.stringify(state.present) === JSON.stringify(action.ranges)) return state
    return { past: [...state.past, state.present].slice(-50), present: action.ranges, future: [] }
  }
  if (action.type === 'undo' && state.past.length) return {
    past: state.past.slice(0, -1), present: state.past.at(-1)!, future: [state.present, ...state.future],
  }
  if (action.type === 'redo' && state.future.length) return {
    past: [...state.past, state.present], present: state.future[0]!, future: state.future.slice(1),
  }
  return state
}

/** null means the preview reached the end; otherwise seek only across excluded time. */
export function previewPosition(time: number, ranges: RenderRange[]): number | null {
  for (const range of ranges) {
    if (time < range.start) return range.start
    if (time < range.end) return time
  }
  return null
}
