import { apiBase } from './cloudflare'
export interface BrollClip {
  id: number
  url: string
  preview: string
  width: number
  height: number
  duration: number
  user?: string
}

export async function searchBroll(query: string, perPage = 12): Promise<BrollClip[]> {
  const token = await (await import('./auth')).getIdToken()
  const params = new URLSearchParams({ query, per_page: String(perPage) })
  const res = await fetch(`${apiBase()}/broll?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const result = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(result?.error ?? 'Não foi possível buscar clipes agora.')
  }
  const data = (await res.json()) as {
    videos: {
      id: number
      image: string
      width: number
      height: number
      duration: number
      user?: { name: string }
      video_files: { id: number; link: string; quality: string; width: number; height: number }[]
    }[]
  }
  return (data.videos ?? [])
    .map((v) => {
      const file =
        v.video_files
          .filter((f) => f.quality === 'hd' || f.quality === 'sd')
          .sort((a, b) => Math.abs((b.width || 0) - 1280) - Math.abs((a.width || 0) - 1280))[0] ??
        v.video_files[0]
      return {
        id: v.id,
        url: file?.link ?? '',
        preview: v.image,
        width: v.width,
        height: v.height,
        duration: v.duration,
        user: v.user?.name,
      }
    })
    .filter((c) => c.url.length > 0)
}
