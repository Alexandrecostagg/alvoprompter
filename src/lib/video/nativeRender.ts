import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { readNativeMovie } from '../capture/readNativeMovie'
import type { CaptureValidation } from '../capture/types'
import type { RenderConfig } from './render'

interface ExportedMovie { uri: string; type: string; bytes: number; validation: CaptureValidation }
interface NativeExport {
  render(options: { id: string; source?: { id: string; scope: string }; uri?: string; config: object }): Promise<ExportedMovie>
  cancel(options: { id: string }): Promise<void>
  addListener(event: 'progress', callback: (event: { id: string; fraction: number }) => void): Promise<PluginListenerHandle>
}
const nativeExport = registerPlugin<NativeExport>('AlvoVideoExport')
const aborted = () => new DOMException('Exportação cancelada.', 'AbortError')

/** Encodes the decoded music exactly once; offline export never opens an AudioContext. */
export function musicWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels), frames = buffer.length
  const data = new ArrayBuffer(44 + frames * channels * 2), view = new DataView(data)
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, data.byteLength - 44, true)
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, samples[channel]![i]!))
    view.setInt16(44 + (i * channels + channel) * 2, sample * (sample < 0 ? 32768 : 32767), true)
  }
  return new Blob([data], { type: 'audio/wav' })
}

async function stage(blob: Blob, path: string, signal?: AbortSignal): Promise<string> {
  for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
    if (signal?.aborted) throw aborted()
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob.slice(offset, offset + 512 * 1024))
    })
    const options = { path, directory: Directory.Library, data }
    if (offset === 0) await Filesystem.writeFile({ ...options, recursive: true })
    else await Filesystem.appendFile(options)
  }
  return (await Filesystem.getUri({ path, directory: Directory.Library })).uri
}

export async function renderNativeVideo(cfg: RenderConfig): Promise<Blob> {
  const id = crypto.randomUUID(), folder = `Application Support/VideoExportInputs/${id}`
  let listener: PluginListenerHandle | undefined
  let cancelled = false, running = false, timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => { cancelled = true; if (running) void nativeExport.cancel({ id }).catch(() => undefined) }
  cfg.signal?.addEventListener('abort', cancel, { once: true })
  try {
    if (cfg.signal?.aborted) throw aborted()
    let source = cfg.nativeSource
    if (source) {
      const base = `Application Support/CameraTakes/${source.id}`
      const available = await Promise.allSettled(['mp4', 'mov'].map(ext => Filesystem.stat({ path: `${base}.${ext}`, directory: Directory.Library })))
      if (!available.some(result => result.status === 'fulfilled' && result.value.size > 0)) source = undefined
    }
    const uri = source ? undefined : await stage(cfg.sourceBlob, `${folder}/source.${cfg.sourceBlob.type.includes('quicktime') ? 'mov' : 'mp4'}`, cfg.signal)
    let logo: object | undefined
    if (cfg.logo) {
      const canvas = document.createElement('canvas')
      canvas.width = cfg.logo.image.naturalWidth; canvas.height = cfg.logo.image.naturalHeight
      const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a logo.')
      context.drawImage(cfg.logo.image, 0, 0)
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Logo inválida.')), 'image/png'))
      logo = { uri: await stage(png, `${folder}/logo.png`, cfg.signal), position: cfg.logo.position, widthPct: cfg.logo.widthPct, opacity: cfg.logo.opacity }
    }
    const music = cfg.music ? { uri: await stage(musicWav(cfg.music.buffer), `${folder}/music.wav`, cfg.signal), volume: cfg.music.volume } : undefined
    const cropPath = cfg.cropAt ? cfg.keepRanges.flatMap(range => {
      const count = Math.max(1, Math.ceil((range.end - range.start) * 2))
      return Array.from({ length: count + 1 }, (_, i) => { const time = range.start + (range.end - range.start) * i / count; return { time, crop: cfg.cropAt!(time) } })
    }).sort((a, b) => a.time - b.time) : undefined
    let progress = 0
    listener = await nativeExport.addListener('progress', event => { if (event.id === id && !cancelled) { progress = Math.max(progress, Math.min(.98, event.fraction)); cfg.onProgress?.(progress) } })
    if (cancelled || cfg.signal?.aborted) throw aborted()
    const { sourceBlob: _blob, sourceVideo: _video, nativeSource: _source, sourceInfo: _info, preserveOriginal: _preserve, cropAt: _cropAt, onProgress: _onProgress, signal: _signal, ...values } = cfg
    running = true
    // A disconnected native bridge must also release the UI, even if no result event arrives.
    const duration = cfg.keepRanges.reduce((sum, range) => sum + range.end - range.start, 0)
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { cancel(); reject(new Error('A exportação demorou além do esperado. O original e sua edição foram mantidos.')) }, Math.max(120_000, duration * 5000 + 60_000)) })
    const result = await Promise.race([nativeExport.render({ id, source, uri, config: { ...values, cropPath, logo, music } }), timeout])
    if (cancelled || cfg.signal?.aborted) throw aborted()
    if (!result.validation.healthy || !result.bytes) throw new Error('O vídeo final não passou na conferência de imagem e áudio.')
    const blob = await readNativeMovie(result)
    if (cancelled || cfg.signal?.aborted) throw aborted()
    cfg.onProgress?.(1)
    return blob
  } catch (error) { if (cancelled || cfg.signal?.aborted) throw aborted(); throw error }
  finally {
    clearTimeout(timer); cfg.signal?.removeEventListener('abort', cancel)
    await listener?.remove().catch(() => undefined)
    // Only this job's temporary copies are removed; native originals/exports stay intact.
    await Filesystem.rmdir({ path: folder, directory: Directory.Library, recursive: true }).catch(() => undefined)
  }
}
