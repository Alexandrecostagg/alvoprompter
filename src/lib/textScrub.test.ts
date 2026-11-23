import { expect, it } from 'vitest'
import { scrubFraction } from './textScrub'
it('pulling down returns to earlier text and pushing up advances it', () => {
  const lines = [0, 0, 80, 80, 160, 160, 240, 240]
  expect(scrubFraction(lines, .7, 90)).toBeLessThan(.7)
  expect(scrubFraction(lines, .3, -90)).toBeGreaterThan(.3)
})
it('respects wrapped line positions and clamps both ends', () => {
  expect(scrubFraction([0, 20, 120, 140], .5, 10)).toBeCloseTo(.4666667)
  expect(scrubFraction([0, 20, 120, 140], .5, 1000)).toBe(0)
  expect(scrubFraction([0, 20, 120, 140], .5, -1000)).toBe(1)
})
it('does not jump text on a tap or fail on a short script', () => {
  expect(scrubFraction([0, 0, 50], .4, 0)).toBe(.4)
  expect(scrubFraction([], .5, 80)).toBe(0)
  expect(scrubFraction([0], .5, 80)).toBe(0)
})
