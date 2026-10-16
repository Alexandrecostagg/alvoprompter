import { useEffect, useRef } from 'react'
import { prepareRecordedPlayback } from '../../lib/recordingAudio'
import { previewPosition } from '../../lib/editRanges'
import type { RenderRange } from '../../lib/video/render'

export default function CutPreview({ url, ranges, disabled }: { url: string; ranges: RenderRange[]; disabled: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.pause()
    if (video.readyState >= 1) video.currentTime = ranges[0]?.start ?? 0
    let frame = 0
    const check = () => {
      if (video.seeking) return
      const next = previewPosition(video.currentTime, ranges)
      if (next === null || disabled) video.pause()
      else if (Math.abs(next - video.currentTime) > .001) video.currentTime = next
    }
    const tick = () => { check(); if (!video.paused) frame = requestAnimationFrame(tick) }
    const play = () => {
      cancelAnimationFrame(frame)
      if (disabled || !ranges.length) { video.pause(); return }
      prepareRecordedPlayback()
      if (previewPosition(video.currentTime, ranges) === null) video.currentTime = ranges[0]!.start
      frame = requestAnimationFrame(tick)
    }
    const stop = () => cancelAnimationFrame(frame)
    video.addEventListener('play', play)
    video.addEventListener('pause', stop)
    video.addEventListener('timeupdate', check)
    video.addEventListener('seeked', check)
    return () => {
      cancelAnimationFrame(frame)
      video.pause()
      video.removeEventListener('play', play)
      video.removeEventListener('pause', stop)
      video.removeEventListener('timeupdate', check)
      video.removeEventListener('seeked', check)
    }
  }, [url, ranges, disabled])
  return <video ref={ref} src={url} controls playsInline preload="metadata"
    aria-label="Prévia dos cortes com áudio" className="h-full w-full" style={{ objectFit: 'contain' }} />
}
