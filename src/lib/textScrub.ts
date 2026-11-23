/** Convert a vertical drag into a reading position, respecting actual wrapped lines. */
export function scrubFraction(offsets: readonly number[], fraction: number, deltaY: number): number {
  if (offsets.length < 2 || !Number.isFinite(deltaY) || !Number.isFinite(fraction)) return 0
  const position = Math.max(0, Math.min(1, fraction)) * (offsets.length - 1)
  const index = Math.floor(position)
  const origin = offsets[index]! + ((offsets[index + 1] ?? offsets[index]!) - offsets[index]!) * (position - index)
  if (!deltaY) return Math.max(0, Math.min(1, fraction))
  const target = origin - deltaY
  if (target <= offsets[0]!) return 0
  if (target >= offsets.at(-1)!) return 1
  let low = 0, high = offsets.length - 1
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid]! <= target) low = mid
    else high = mid
  }
  const span = offsets[high]! - offsets[low]!
  return (low + (span > 0 ? (target - offsets[low]!) / span : 0)) / (offsets.length - 1)
}
