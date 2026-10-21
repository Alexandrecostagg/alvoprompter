import { useLayoutEffect, useRef, useState } from 'react'
import type { AspectGuideRatio } from '../../lib/types'

const LABELS: Record<Exclude<AspectGuideRatio, 'none'>, string> = {
  '9:16': '9:16 · Instagram Stories / Reels / TikTok / Shorts',
  '4:5': '4:5 · Instagram Feed',
  '1:1': '1:1 · Feed',
  '16:9': '16:9 · YouTube',
}

interface AspectGuideProps {
  ratio: AspectGuideRatio
  dimOutside?: boolean
}

export default function AspectGuide({ ratio, dimOutside = true }: AspectGuideProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const active = ratio !== 'none'

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active) {
      setSize(null)
      return
    }
    const update = () => {
      const node = ref.current
      if (!node) return
      const { clientWidth: cw, clientHeight: ch } = node
      if (!cw || !ch) return
      const [aw, ah] = ratio.split(':').map(Number)
      const target = aw / ah
      let w = cw
      let h = w / target
      if (h > ch) {
        h = ch
        w = h * target
      }
      setSize({ w, h })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, ratio])

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-10">
      {active && size && (
        <>
          <div
            className="absolute rounded-sm border-2 border-white/75"
            style={{
              left: '50%',
              top: '50%',
              width: size.w,
              height: size.h,
              transform: 'translate(-50%, -50%)',
              boxShadow: dimOutside ? '0 0 0 100vmax rgba(0,0,0,0.5)' : 'none',
            }}
          >
            <div
              className="absolute rounded-sm border border-dashed border-white/30"
              style={{ inset: '8%' }}
            />
          </div>
          <span
            className="absolute rounded-md px-2 py-0.5 text-[11px] font-semibold text-white on-dark"
            style={{
              left: '50%',
              top: `calc(50% + ${size.h / 2 + 12}px)`,
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.65)',
              whiteSpace: 'nowrap',
            }}
          >
            {LABELS[ratio as Exclude<AspectGuideRatio, 'none'>]}
          </span>
        </>
      )}
    </div>
  )
}
