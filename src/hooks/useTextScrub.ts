import { useRef, type PointerEvent } from 'react'
import { scrubFraction } from '../lib/textScrub'

/** Text gestures have no reference to the camera or recorder. */
export function useTextScrub(options: {
  fraction: () => number
  offsets: () => readonly number[]
  pause: () => void
  seek: (fraction: number) => void
}) {
  const drag = useRef<{ pointer: number; y: number; fraction: number; active: boolean } | null>(null)
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointer !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0) return
      drag.current = { pointer: event.pointerId, y: event.clientY, fraction: options.fraction(), active: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      const delta = event.clientY - current.y
      if (!current.active && Math.abs(delta) < 6) return
      if (!current.active) { current.active = true; options.pause() }
      event.preventDefault()
      options.seek(scrubFraction(options.offsets(), current.fraction, delta))
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: () => { drag.current = null },
  }
}
