import { db, getAvatars, getVoiceProfiles, newKey, saveAvatar, saveVoiceProfile } from './db'
import type { AvatarTwin, VoiceProfile, VoiceSample } from './types'

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não consegui carregar a imagem.'))
    img.src = dataUrl
  })
}

/** Reduz uma imagem/arquivo para dataUrl pequena (avatar). */
export async function fileToAvatarDataUrl(file: File, maxSize = 1024): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler o áudio.'))
    reader.readAsDataURL(blob)
  })
}

export interface TalkingAvatarOptions {
  image: HTMLImageElement
  width: number
  height: number
  /** 1 = enquadra o rosto inteiro; maior = aproxima (crop). */
  zoom?: number
  /** Fração vertical do ponto de foco (0..1). 0.3 mantém o rosto no terço superior. */
  focusY?: number
  motion?: 'subtle' | 'breathing' | 'none'
  onProgress?: (currentTime: number, duration: number) => void
  onEnded?: () => void
}

const MIME_PREFERRED = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
const AVATAR_FRAME_MS = 1000 / 24
const PROGRESS_UPDATE_MS = 200

function pickMime(): string {
  return MIME_PREFERRED.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? 'video/webm'
}

/**
 * Avatar falante 100% local: anima uma foto (respiração + "boca" sincronizada
 * com a amplitude do áudio) e grava vídeo com o áudio embutido — sem servidor.
 */
export class TalkingAvatar {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private opts: Required<Omit<TalkingAvatarOptions, 'onProgress' | 'onEnded'>>
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private raf = 0
  private syntheticSpeaking = false
  private startTime = 0
  private pausedAt = 0
  private recording = false
  private recorder: MediaRecorder | null = null
  private recordingStream: MediaStream | null = null
  private recordingDestination: MediaStreamAudioDestinationNode | null = null
  private chunks: Blob[] = []
  private ended = false
  private onProgress?: (currentTime: number, duration: number) => void
  private onEnded?: () => void
  private analyserData = new Uint8Array(256)
  private lastDrawAt = 0
  private lastProgressAt = 0

  constructor(canvas: HTMLCanvasElement, options: TalkingAvatarOptions) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D indisponível.')
    this.ctx = ctx
    this.opts = {
      zoom: options.zoom ?? 1.1,
      focusY: options.focusY ?? 0.3,
      motion: options.motion ?? 'breathing',
      image: options.image,
      width: options.width,
      height: options.height,
    }
    this.onProgress = options.onProgress
    this.onEnded = options.onEnded
    canvas.width = options.width
    canvas.height = options.height
    this.draw(performance.now() / 1000, 0)
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : 0
  }

  get currentTime(): number {
    if (!this.audioCtx || !this.buffer || this.buffer.duration <= 0) return 0
    if (this.audioCtx.state === 'running' && !this.ended) {
      return Math.min(
        this.buffer.duration,
        Math.max(0, this.audioCtx.currentTime - this.startTime + this.pausedAt),
      )
    }
    return this.pausedAt
  }

  private async ensureCtx(): Promise<void> {
    if (this.audioCtx) return
    this.audioCtx = new AudioContext()
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.55
    this.analyserData = new Uint8Array(this.analyser.fftSize)
    this.analyser.connect(this.audioCtx.destination)
  }

  async loadAudio(blob: Blob): Promise<void> {
    this.buffer = await decodeAudioBlob(blob)
    this.ended = false
    this.pausedAt = 0
  }

  async start(): Promise<void> {
    if (!this.buffer) throw new Error('Carregue o áudio antes de iniciar.')
    await this.ensureCtx()
    if (this.source) this.pause()
    await this.audioCtx!.resume()
    this.source = this.audioCtx!.createBufferSource()
    this.source.buffer = this.buffer
    this.source.connect(this.analyser!)
    this.startTime = this.audioCtx!.currentTime
    this.source.start(0, this.pausedAt % this.buffer.duration)
    this.source.onended = () => this.handleEnded()
    this.ended = false
    this.lastDrawAt = 0
    this.lastProgressAt = 0
    this.tick()
  }

  /** Anima a fala quando o áudio vem da voz nativa do aparelho. */
  startVisualSpeech(): void {
    cancelAnimationFrame(this.raf)
    this.syntheticSpeaking = true
    const startedAt = performance.now()
    let lastDrawAt = 0
    const loop = (now: number) => {
      if (!this.syntheticSpeaking) return
      if (now - lastDrawAt >= AVATAR_FRAME_MS) {
        lastDrawAt = now
        const elapsed = now - startedAt
        const cadence = Math.sin(elapsed * 0.018)
        const syllables = Math.sin(elapsed * 0.041)
        const amp = 0.08 + Math.max(0, cadence * 0.06) + Math.max(0, syllables * 0.04)
        this.draw(now / 1000, amp)
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stopVisualSpeech(): void {
    this.syntheticSpeaking = false
    cancelAnimationFrame(this.raf)
    this.draw(performance.now() / 1000, 0)
  }

  pause(): void {
    this.syntheticSpeaking = false
    if (this.source && this.audioCtx) {
      this.pausedAt = this.currentTime
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        /* já parado */
      }
      this.source.disconnect()
      this.source = null
      this.audioCtx.suspend()
    }
    cancelAnimationFrame(this.raf)
    this.draw(performance.now() / 1000, 0)
  }

  stop(): void {
    this.syntheticSpeaking = false
    this.pause()
    this.pausedAt = 0
    this.ended = false
  }

  private handleEnded(): void {
    cancelAnimationFrame(this.raf)
    this.source?.disconnect()
    this.source = null
    this.ended = true
    this.pausedAt = this.duration
    this.onProgress?.(this.duration, this.duration)
    this.onEnded?.()
  }

  private amp(): number {
    if (!this.analyser || !this.audioCtx || this.audioCtx.state !== 'running') return 0
    const data = this.analyserData
    this.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    return Math.min(1, rms * 3.2)
  }

  private draw(t: number, amp: number): void {
    const { width: w, height: h, image: img, zoom, focusY, motion } = this.opts
    const ctx = this.ctx
    ctx.fillStyle = '#0b0d12'
    ctx.fillRect(0, 0, w, h)

    // enquadra "capa" respeitando o foco vertical (rosto no terço superior)
    const baseScale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const scale = baseScale * zoom
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const focus = Math.max(0, Math.min(1, focusY))
    let x = (w - drawW) / 2
    let y = focus * (h - drawH)

    // Movimento corporal de repouso. A boca continua sincronizada mesmo no modo parado.
    let sx = 1
    let sy = 1
    let bob = 0
    if (motion === 'breathing') {
      const breath = Math.sin(t * 0.9) * 0.012
      sx = 1 + breath
      sy = 1 + breath
      bob = Math.sin(t * 1.3) * Math.max(2, h * 0.004)
    } else if (motion === 'subtle') {
      const breath = Math.sin(t * 0.75) * 0.004
      sx = 1 + breath
      sy = 1 + breath
      bob = Math.sin(t * 1.1) * Math.max(0.7, h * 0.0015)
    }
    const cx = x + drawW / 2
    const cy = y + drawH / 2
    ctx.translate(cx, cy + bob)
    ctx.scale(sx, sy)
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // Lip sync local para retratos frontais. A região inferior do rosto é
    // deformada pela amplitude do áudio, em vez de ampliar a foto inteira.
    if (amp > 0.015) {
      const mouthX = Math.max(w * 0.18, Math.min(w * 0.82, x + drawW * 0.5))
      const mouthY = Math.max(h * 0.38, Math.min(h * 0.78, y + drawH * 0.61))
      const mouthW = Math.max(18, Math.min(w * 0.17, drawW * 0.14))
      const mouthH = Math.max(8, Math.min(h * 0.035, drawH * 0.032))
      const open = Math.min(1, Math.max(0, (amp - 0.015) * 3.8))

      ctx.save()
      ctx.beginPath()
      ctx.ellipse(mouthX, mouthY, mouthW * 0.62, mouthH * 1.7, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.translate(mouthX, mouthY)
      ctx.scale(1, 1 + open * 0.22)
      ctx.translate(-mouthX, -mouthY)
      ctx.drawImage(img, x, y, drawW, drawH)
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = 0.2 + open * 0.42
      ctx.fillStyle = '#16090d'
      ctx.beginPath()
      ctx.ellipse(mouthX, mouthY + mouthH * 0.15, mouthW * 0.36, mouthH * (0.14 + open * 0.7), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // indicador de "falando" sutil no canto
    if (amp > 0.05) {
      ctx.globalAlpha = 0.85
      const bars = 3
      const bw = 5
      const gap = 3
      const total = bars * bw + (bars - 1) * gap
      const bx = w / 2 - total / 2
      const by = h - 18
      for (let i = 0; i < bars; i++) {
        const ba = Math.max(0.2, Math.sin(t * 10 + i) * 0.5 + 0.5) * (amp + 0.25)
        ctx.fillStyle = '#22d3ee'
        ctx.fillRect(bx + i * (bw + gap), by - ba * 10, bw, ba * 10)
      }
      ctx.globalAlpha = 1
    }
  }

  private tick = (now = performance.now()): void => {
    if (this.ended) return
    if (now - this.lastProgressAt >= PROGRESS_UPDATE_MS) {
      this.lastProgressAt = now
      this.onProgress?.(this.currentTime, this.duration)
    }
    if (now - this.lastDrawAt >= AVATAR_FRAME_MS) {
      this.lastDrawAt = now
      this.draw(now / 1000, this.amp())
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Começa a gravar o vídeo (imagem + áudio). */
  async startRecording(): Promise<void> {
    if (this.recording) return
    await this.ensureCtx()
    this.recording = true
    this.chunks = []
    const stream = this.canvas.captureStream(24)
    this.recordingStream = stream
    const dest = this.audioCtx!.createMediaStreamDestination()
    this.recordingDestination = dest
    this.analyser?.connect(dest)
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track))
    const mime = pickMime()
    try {
      this.recorder = new MediaRecorder(stream, mime.startsWith('video/mp4') ? undefined : { mimeType: mime, videoBitsPerSecond: 3_500_000 })
    } catch (error) {
      try {
        this.analyser?.disconnect(dest)
      } catch {
        /* conexão já removida */
      }
      stream.getTracks().forEach((track) => track.stop())
      this.recordingStream = null
      this.recordingDestination = null
      this.recording = false
      throw error
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(1000)
  }

  /** Para a gravação e devolve o vídeo (WebM/MP4). */
  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.recorder || !this.recording) {
        this.recording = false
        resolve(null)
        return
      }
      const recorder = this.recorder
      recorder.onstop = () => {
        this.recording = false
        if (this.recordingDestination) {
          try {
            this.analyser?.disconnect(this.recordingDestination)
          } catch {
            /* conexão já removida */
          }
        }
        this.recordingDestination = null
        this.recordingStream?.getTracks().forEach((track) => track.stop())
        this.recordingStream = null
        const type = recorder.mimeType || 'video/webm'
        this.recorder = null
        resolve(new Blob(this.chunks, { type }))
      }
      recorder.stop()
    })
  }

  destroy(): void {
    this.syntheticSpeaking = false
    cancelAnimationFrame(this.raf)
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.ondataavailable = null
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.recordingStream?.getTracks().forEach((track) => track.stop())
    this.recordingStream = null
    this.recordingDestination = null
    this.recorder = null
    this.recording = false
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        /* já parado */
      }
    }
    if (this.audioCtx) void this.audioCtx.close()
    this.audioCtx = null
    this.analyser = null
  }
}

// ---- CRUD de avatares e perfis de voz ----

export async function listAvatars(): Promise<AvatarTwin[]> {
  return getAvatars()
}

export async function upsertAvatar(avatar: AvatarTwin): Promise<number> {
  return saveAvatar(avatar)
}

export async function removeAvatar(id: number): Promise<void> {
  await db.avatars.delete(id)
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  return getVoiceProfiles()
}

export async function upsertVoiceProfile(profile: VoiceProfile): Promise<number> {
  return saveVoiceProfile(profile)
}

export async function removeVoiceProfile(id: number): Promise<void> {
  await db.voiceProfiles.delete(id)
}

export async function createAvatar(name: string, dataUrl: string, source: AvatarTwin['source']): Promise<number> {
  return saveAvatar({ key: newKey('a'), name, imageDataUrl: dataUrl, source, createdAt: Date.now() })
}

export async function createVoiceProfile(name: string, samples: VoiceSample[], lang: string): Promise<number> {
  return saveVoiceProfile({ key: newKey('v'), name, samples, lang, createdAt: Date.now() })
}

// ---- Gravação de referências de voz (reprodução; não realiza clonagem) ----

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private timer = 0
  private startedAt = 0

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = ['audio/webm', 'audio/mp4', ''].find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? ''
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = Date.now()
    this.recorder.start()
    this.timer = window.setInterval(() => {
      this.onTick?.((Date.now() - this.startedAt) / 1000)
    }, 200)
  }

  onTick: ((seconds: number) => void) | null = null

  async stop(): Promise<VoiceSample> {
    clearInterval(this.timer)
    const duration = (Date.now() - this.startedAt) / 1000
    return new Promise((resolve, reject) => {
      if (!this.recorder) {
        reject(new Error('Gravação não iniciada.'))
        return
      }
      this.recorder.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        this.stream = null
        const type = this.recorder?.mimeType || 'audio/webm'
        const blob = new Blob(this.chunks, { type })
        const dataUrl = await blobToDataUrl(blob)
        resolve({ dataUrl, duration })
      }
      this.recorder.stop()
    })
  }

  cancel(): void {
    clearInterval(this.timer)
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s)
  if (!m) return null
  try {
    const bytes = atob(m[2]!)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: m[1] ?? 'audio/webm' })
  } catch {
    return null
  }
}
