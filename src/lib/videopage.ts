import { apiBase } from './cloudflare'
import { savedSyncPass } from './syncWorker'

export interface VideoPage {
  id: string
  title: string
  description: string
  author: string
  createdAt: string
  videoUrl: string
  views: number
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60) || 'video'
}

async function optionalToken(): Promise<string | null> {
  return (await import('./auth')).getOptionalIdToken()
}

/** Cria uma página de vídeo compartilhável: envia o vídeo ao R2 e registra a página. */
export async function createVideoPage(opts: {
  blob: Blob
  fileName: string
  title: string
  description?: string
}): Promise<VideoPage> {
  const pass = savedSyncPass()
  if (!pass) throw new Error('Defina a frase-chave de sincronização para criar uma página de vídeo.')

  const mediaKey = `${Date.now()}-${sanitizeName(opts.fileName)}`
  const upload = await fetch(`${apiBase()}/media/${encodeURIComponent(mediaKey)}`, {
    method: 'PUT',
    headers: { 'x-sync-pass': pass, 'Content-Type': opts.blob.type || 'video/webm' },
    body: opts.blob,
  })
  if (!upload.ok) {
    const body = (await upload.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Falha ao enviar o vídeo.')
  }

  const token = await optionalToken()
  const res = await fetch(`${apiBase()}/videopages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-pass': pass,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      title: opts.title.slice(0, 200),
      description: (opts.description ?? '').slice(0, 500),
      mediaKey,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Falha ao criar a página de vídeo.')
  }
  return res.json() as Promise<VideoPage>
}

/** Busca uma página de vídeo pública (sem autenticação). */
export async function fetchVideoPage(id: string): Promise<VideoPage> {
  const res = await fetch(`${apiBase()}/videopages/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Página de vídeo não encontrada.')
  }
  return res.json() as Promise<VideoPage>
}

export function videoPageShareUrl(id: string): string {
  return `${location.origin}${location.pathname}?v=${encodeURIComponent(id)}`
}

export function videoPageQueryId(): string | null {
  return new URLSearchParams(location.search).get('v')
}
