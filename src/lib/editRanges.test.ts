import { describe, expect, it } from 'vitest'
import { applyTimeCut, cutHistoryReducer, emptyCutHistory, intersectRanges, normalizeRanges, previewPosition, removeRange } from './editRanges'

const whole = [{ start: 0, end: 16 }]
describe('editing intervals independent from captions', () => {
  it('removes only the selected interval and preserves all surrounding video', () => {
    expect(removeRange(whole, { start: 8, end: 8.5 }, 16)).toEqual([
      { start: 0, end: 8 }, { start: 8.5, end: 16 },
    ])
  })
  it('keeps precisely 3–4 seconds without a transcript', () => {
    expect(applyTimeCut(whole, { type: 'range', from: 3, to: 4 }, 16)).toEqual([{ start: 3, end: 4 }])
  })
  it('applies consecutive start/end trims on original time without restoring earlier cuts', () => {
    const first = applyTimeCut(whole, { type: 'trim-start', seconds: 2 }, 16)
    expect(applyTimeCut(first, { type: 'trim-end', seconds: 3 }, 16)).toEqual([{ start: 2, end: 13 }])
  })
  it('composes automatic suggestions with existing manual exclusions', () => {
    const manual = removeRange(whole, { start: 2, end: 4 }, 16)
    expect(intersectRanges(manual, [{ start: 1, end: 5 }, { start: 9, end: 12 }], 16)).toEqual([
      { start: 1, end: 2 }, { start: 4, end: 5 }, { start: 9, end: 12 },
    ])
  })
  it('bounds and merges overlapping ranges to avoid replaying frames or audio', () => {
    expect(normalizeRanges([{ start: 4, end: 99 }, { start: -2, end: 5 }, { start: NaN, end: 7 }], 8))
      .toEqual([{ start: 0, end: 8 }])
  })
  it('rejects invalid ranges and all-removed results instead of silently exporting the original', () => {
    expect(normalizeRanges([{ start: 6, end: 3 }], 8)).toEqual([])
    expect(removeRange(whole, { start: 0, end: 16 }, 16)).toEqual([])
    expect(intersectRanges(whole, [], 16)).toEqual([])
  })
  it('keeps the input immutable', () => {
    const input = [{ start: 2, end: 4 }, { start: 1, end: 3 }]
    normalizeRanges(input, 8)
    expect(input).toEqual([{ start: 2, end: 4 }, { start: 1, end: 3 }])
  })
})

describe('cut history', () => {
  it('undoes and redoes an entire operation and clears redo after a new edit', () => {
    const initial = cutHistoryReducer(emptyCutHistory, { type: 'reset', ranges: whole })
    const edit = cutHistoryReducer(initial, { type: 'apply', ranges: [{ start: 3, end: 4 }] })
    const undone = cutHistoryReducer(edit, { type: 'undo' })
    expect(undone.present).toEqual(whole)
    expect(cutHistoryReducer(undone, { type: 'redo' }).present).toEqual(edit.present)
    const other = cutHistoryReducer(undone, { type: 'apply', ranges: [{ start: 1, end: 2 }] })
    expect(other.future).toEqual([])
  })
  it('does not create redundant history and resets between recordings', () => {
    const initial = cutHistoryReducer(emptyCutHistory, { type: 'reset', ranges: whole })
    expect(cutHistoryReducer(initial, { type: 'apply', ranges: [...whole] })).toBe(initial)
    const edit = cutHistoryReducer(initial, { type: 'apply', ranges: [{ start: 3, end: 4 }] })
    expect(cutHistoryReducer(edit, { type: 'reset', ranges: [{ start: 0, end: 8 }] })).toEqual({ past: [], present: [{ start: 0, end: 8 }], future: [] })
  })
})

describe('preview and export share the same intervals', () => {
  const ranges = [{ start: 1, end: 2 }, { start: 4, end: 6 }]
  it('skips excluded beginnings and gaps, with an exclusive end boundary', () => {
    expect(previewPosition(0, ranges)).toBe(1)
    expect(previewPosition(1.5, ranges)).toBe(1.5)
    expect(previewPosition(2, ranges)).toBe(4)
    expect(previewPosition(3, ranges)).toBe(4)
    expect(previewPosition(6, ranges)).toBeNull()
    expect(previewPosition(0, [])).toBeNull()
  })
})
