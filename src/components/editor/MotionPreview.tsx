import { useEffect, useRef, useState } from 'react'
import { applyMotion, chromaKeyPixels, computeCrop, MOTION_PRESETS, type ChromaKeyConfig, type MotionPreset } from '../../lib/video/render'

/** A short sample from a still of the user's video, using the export transforms. */
export default function MotionPreview({ url, motion, aspect, chroma }: { url: string; motion: MotionPreset; aspect: number; chroma?: ChromaKeyConfig }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const source = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setReady(false); setPlaying(false); setError('')
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    video.onloadeddata = () => {
      const still = document.createElement('canvas')
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      still.width = Math.round(video.videoWidth * scale); still.height = Math.round(video.videoHeight * scale)
      const ctx = still.getContext('2d')
      if (!ctx || !still.width || !still.height) { setError('Não foi possível abrir a amostra.'); return }
      ctx.drawImage(video, 0, 0, still.width, still.height)
      source.current = still; setReady(true)
      video.removeAttribute('src'); video.load()
    }
    video.onerror = () => setError('Não foi possível abrir a amostra.')
    video.src = url; video.load()
    return () => { video.onloadeddata = video.onerror = null; video.removeAttribute('src'); video.load(); source.current = null }
  }, [url])
  useEffect(() => {
    const still = source.current, output = canvas.current
    if (!ready || !still || !output) return
    const ctx = output.getContext('2d')
    if (!ctx) return
    output.width = Math.min(360, Math.round(240 * aspect)); output.height = Math.round(output.width / aspect)
    const image = document.createElement('canvas'); image.width = still.width; image.height = still.height
    const imageCtx = image.getContext('2d', { willReadFrequently: true })!
    imageCtx.drawImage(still, 0, 0)
    if (chroma) { const pixels = imageCtx.getImageData(0, 0, image.width, image.height); chromaKeyPixels(pixels.data, chroma); imageCtx.putImageData(pixels, 0, 0) }
    const base = computeCrop(still.width, still.height, output.width, output.height)
    let frame = 0, start: number | undefined
    const draw = (now: number) => {
      start ??= now
      const fraction = playing ? Math.min(1, (now - start) / 4000) : 0
      const crop = applyMotion(base, motion, fraction, still.width, still.height)
      ctx.fillStyle = chroma?.bgColor ?? '#000'; ctx.fillRect(0, 0, output.width, output.height)
      ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, output.width, output.height)
      if (playing && fraction < 1) frame = requestAnimationFrame(draw)
      else if (playing) setPlaying(false)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [ready, motion, aspect, chroma, playing])
  return <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
    <p className="mb-2 text-xs font-semibold">Amostra · {MOTION_PRESETS.find(p => p.value === motion)?.label}</p>
    <canvas ref={canvas} aria-label="Amostra de fundo e movimento" className="mx-auto max-h-60 max-w-full rounded-lg" />
    <p className="my-2 text-xs">Veja o movimento e a remoção de fundo em uma imagem do seu vídeo. Aplique as alterações para gerar o vídeo completo.</p>
    {error && <p role="status">{error}</p>}
    <button type="button" disabled={!ready} className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => setPlaying(p => !p)}>{playing ? '■ Parar amostra' : '▶ Ver amostra (4 s)'}</button>
  </div>
}
