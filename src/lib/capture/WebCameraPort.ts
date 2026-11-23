import { setRecordingAudioMode } from '../recordingAudio'
import { BROKEN_VIDEO_MESSAGE, inspectMp4 } from '../video/integrity'
import type { CameraPort, CapturedMovie } from './types'

/** Browser camera records its original tracks. No canvas, effects or second decoder. */
export class WebCameraPort implements CameraPort {
  readonly native = false
  private preview: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private generation = 0
  private recorder: MediaRecorder | null = null
  private result: Promise<Blob> | null = null
  private settle: ((error?: Error) => void) | null = null
  private stopRequested = false
  private finishTimer: ReturnType<typeof setTimeout> | undefined
  private onInterruption: (reason: string) => void = () => {}
  private removeWatchers = () => {}

  attach(element: HTMLElement | null) {
    const next = element instanceof HTMLVideoElement ? element : null
    if (this.preview === next) return
    if (this.preview) this.preview.srcObject = null
    this.preview = next
    if (next && this.stream) void this.bindPreview(next, this.stream).catch(() => this.onInterruption('A prévia da câmera foi interrompida.'))
  }
  private bindPreview(video: HTMLVideoElement, stream: MediaStream) {
    video.muted = true; video.playsInline = true
    if (video.srcObject !== stream) video.srcObject = stream
    return video.play()
  }
  async open(onInterruption: (reason: string) => void) {
    const generation = ++this.generation
    if (!this.preview) throw new Error('A área da câmera ainda não está pronta. Tente abrir novamente.')
    this.onInterruption = onInterruption
    setRecordingAudioMode('play-and-record')
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
    this.stream = stream
    if (!this.preview) throw new Error('A prévia da câmera foi fechada.')
    let timeout: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([this.bindPreview(this.preview, stream), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Preview timeout')), 10000) })]) }
    catch { throw new Error('Não foi possível iniciar a imagem da câmera. Toque em tentar novamente.') }
    finally { clearTimeout(timeout) }
  }
  async start() {
    if (!this.stream || !this.stream.getVideoTracks().some(track => track.readyState === 'live')) throw new Error('Abra a câmera antes de gravar.')
    if (this.recorder && this.recorder.state !== 'inactive') throw new Error('Já existe uma gravação em andamento.')
    const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
    const encoder = new MediaRecorder(this.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 })
    const chunks: Blob[] = []
    let settled = false
    this.recorder = encoder; this.stopRequested = false
    this.result = new Promise<Blob>((resolve, reject) => {
      this.settle = error => {
        if (settled) return
        settled = true; clearTimeout(this.finishTimer); this.removeWatchers()
        encoder.onstop = encoder.onerror = encoder.ondataavailable = null
        if (error) reject(error)
        else {
          const blob = new Blob(chunks, { type: chunks[0]?.type || encoder.mimeType || mime || 'video/webm' })
          if (!blob.size) reject(new Error('A gravação terminou sem gerar um arquivo. Tente uma nova tomada.'))
          else resolve(blob)
        }
      }
      encoder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      encoder.onstop = () => { this.settle?.(); if (!this.stopRequested) this.onInterruption('O aparelho encerrou a gravação. Confira a tomada salva.') }
      encoder.onerror = () => { this.settle?.(new Error('O aparelho interrompeu o encoder do vídeo.')); this.onInterruption('O aparelho interrompeu a gravação.') }
    })
    // Register rejection immediately; the controller receives the same error on stop.
    void this.result.catch(() => undefined)
    const ended = () => this.onInterruption('A câmera ou o microfone foi interrompido. A tomada será encerrada e conferida.')
    const hidden = () => { if (document.hidden) this.onInterruption('O app saiu da tela. A tomada foi encerrada para preservar o vídeo.') }
    this.stream.getTracks().forEach(track => track.addEventListener('ended', ended))
    document.addEventListener('visibilitychange', hidden)
    this.removeWatchers = () => {
      this.stream?.getTracks().forEach(track => track.removeEventListener('ended', ended))
      document.removeEventListener('visibilitychange', hidden)
    }
    // MP4 is finalized once; WebM may deliver independent chunks while capturing.
    if ((encoder.mimeType || mime || '').includes('mp4')) encoder.start()
    else encoder.start(1000)
  }
  async stop(): Promise<CapturedMovie> {
    const encoder = this.recorder, result = this.result
    if (!encoder || !result) throw new Error('Não há uma tomada para finalizar.')
    this.stopRequested = true
    if (encoder.state !== 'inactive') {
      if (!this.finishTimer) this.finishTimer = setTimeout(() => this.settle?.(new Error('O aparelho não finalizou o arquivo de vídeo. A câmera foi liberada; tente uma nova tomada.')), 15000)
      encoder.stop()
    }
    const blob = await result
    const integrity = await inspectMp4(blob)
    return { blob, warning: integrity?.problem ? BROKEN_VIDEO_MESSAGE : undefined, duration: integrity?.videoSeconds }
  }
  async close() {
    ++this.generation
    if (this.recorder?.state !== 'inactive' && this.result) await this.stop().catch(() => undefined)
    this.removeWatchers(); this.removeWatchers = () => {}
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null; this.recorder = null; this.result = null; this.settle = null
    clearTimeout(this.finishTimer); this.finishTimer = undefined
    if (this.preview) { this.preview.pause(); this.preview.srcObject = null }
    setRecordingAudioMode('playback')
  }
}
