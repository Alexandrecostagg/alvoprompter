import { computeCrop, type VideoCrop } from './video/render'

export interface FaceSample {
  t: number
  cx: number
  cy: number
  ey: number
  found: boolean
}

interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

interface FaceDetectorInstance {
  detect(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  ): Promise<{ boundingBox: FaceBox }[]>
}

declare global {
  interface Window {
    FaceDetector?: new (opts?: {
      fastMode?: boolean
      maxDetectedFaces?: number
    }) => FaceDetectorInstance
  }
}

/** Shape Detection API (Chrome/Edge desktop e Android). Fallback: sem tracking. */
export function faceTrackingSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.FaceDetector === 'function'
}

/**
 * Amostra o vídeo a cada `sampleEvery` segundos e registra o centroide do rosto.
 * Retorna path em coordenadas normalizadas (0..1). Pontos sem rosto são marcados
 * `found: false` e usam o centro como fallback.
 */
export async function computeFacePath(
  blob: Blob,
  sampleEvery = 1,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<FaceSample[]> {
  const FD = window.FaceDetector
  if (!FD) throw new Error('Detecção de rosto indisponível neste navegador.')
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Não foi possível ler o vídeo.'))
    })
    const duration = video.duration || 0
    const step = Math.max(0.5, sampleEvery)
    const total = Math.max(1, Math.ceil(duration / step))
    const samples: FaceSample[] = []
    const detector = new FD({ fastMode: true, maxDetectedFaces: 1 })
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) break
      const t = Math.min(i * step, Math.max(0, duration - 0.05))
      video.currentTime = t
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
      })
      let found = false
      try {
        const faces = await detector.detect(video)
        if (faces.length) {
          const b = faces[0]!.boundingBox
          samples.push({
            t,
            cx: (b.x + b.width / 2) / video.videoWidth,
            cy: (b.y + b.height / 2) / video.videoHeight,
            ey: (b.y + b.height * 0.38) / video.videoHeight,
            found: true,
          })
          found = true
        }
      } catch {
        // ignora falha pontual
      }
      if (!found) samples.push({ t, cx: 0.5, cy: 0.5, ey: 0.5, found: false })
      onProgress?.(i + 1, total)
    }
    return samples
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Crop que mantém o rosto centralizado no reframe, interpolando entre as amostras.
 * Com `eyeContact: true`, centraliza na linha dos olhos (em vez do centro do rosto)
 * mantendo os olhos na faixa superior do quadro. Não altera a direção do olhar.
 * Sem amostras válidas, cai no crop central padrão (computeCrop).
 */
export function cropCenteredOnFace(
  path: FaceSample[],
  t: number,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  eyeContact = false,
): VideoCrop {
  const base = computeCrop(srcW, srcH, targetW, targetH)
  const found = path.filter((s) => s.found)
  if (!found.length) return base

  let prev = found[0]!
  let next = found[found.length - 1]!
  for (const s of found) {
    if (s.t <= t) prev = s
    if (s.t >= t) {
      next = s
      break
    }
  }
  const span = Math.max(0.0001, next.t - prev.t)
  const k = Math.max(0, Math.min(1, (t - prev.t) / span))
  const cx = prev.cx + (next.cx - prev.cx) * k
  const cy = prev.cy + (next.cy - prev.cy) * k
  const ey = prev.ey + (next.ey - prev.ey) * k

  const focusY = eyeContact ? ey : cy
  const targetCy = eyeContact ? 0.38 : 0.5
  let sy = focusY * srcH - targetCy * base.sh
  let sx = cx * srcW - base.sw / 2
  sx = Math.max(0, Math.min(srcW - base.sw, sx))
  sy = Math.max(0, Math.min(srcH - base.sh, sy))
  return { sx, sy, sw: base.sw, sh: base.sh }
}
