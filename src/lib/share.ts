import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type ShareOutcome = 'shared' | 'downloaded'

export interface ShareVideoOptions {
  blob: Blob
  fileName: string
  title?: string
  text?: string
}

export function safeShareFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || `alvoprompter-${Date.now()}.webm`
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('O vídeo salvo não está em um formato válido.')

  const mime = match[1] || 'application/octet-stream'
  const raw = match[3] || ''
  const binary = match[2] ? atob(raw) : decodeURIComponent(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Não consegui preparar o vídeo para compartilhar.'))
    reader.readAsDataURL(blob)
  })
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

async function copyTextSilently(text?: string): Promise<void> {
  if (!text || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // O compartilhamento continua mesmo quando o sistema bloqueia o clipboard.
  }
}

async function shareNativeVideo(options: ShareVideoOptions): Promise<void> {
  const fileName = safeShareFileName(options.fileName)
  const path = `compartilhamentos/${Date.now()}-${fileName}`
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(options.blob),
    directory: Directory.Cache,
    recursive: true,
  })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  await copyTextSilently(options.text)
  await Share.share({
    title: options.title,
    text: options.text,
    files: [uri],
    dialogTitle: 'Compartilhar vídeo',
  })
}

export async function shareVideo(options: ShareVideoOptions): Promise<ShareOutcome> {
  const fileName = safeShareFileName(options.fileName)
  if (Capacitor.isNativePlatform()) {
    await shareNativeVideo({ ...options, fileName })
    return 'shared'
  }

  const file = new File([options.blob], fileName, {
    type: options.blob.type || 'video/webm',
  })
  const shareData: ShareData = {
    title: options.title,
    text: options.text,
    files: [file],
  }
  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (isShareCancelled(error)) throw error
      // Embedded browsers can advertise sharing and still deny the share sheet.
      // Offer the same downloadable file when the system rejects that capability.
    }
  }

  downloadBlob(options.blob, fileName)
  await copyTextSilently(options.text)
  return 'downloaded'
}

export async function shareDataUrl(
  dataUrl: string,
  options: Omit<ShareVideoOptions, 'blob'>,
): Promise<ShareOutcome> {
  return shareVideo({ ...options, blob: dataUrlToBlob(dataUrl) })
}

export async function shareText(title: string, text: string): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    await copyTextSilently(text)
    await Share.share({ title, text, dialogTitle: 'Compartilhar publicação' })
    return 'shared'
  }
  if (navigator.share) {
    await navigator.share({ title, text })
    return 'shared'
  }
  await navigator.clipboard.writeText(text)
  return 'downloaded'
}

export function isShareCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /cancel|canceled|cancelado|abort/i.test(message)
}
