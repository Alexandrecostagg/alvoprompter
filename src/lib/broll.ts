export interface BrollClip {
  id: number
  url: string
  preview: string
  width: number
  height: number
  duration: number
  user?: string
}

const PEXELS_KEY = (import.meta.env.VITE_PEXELS_API_KEY as string | undefined)?.trim() ?? ''

export function hasBrollKey(): boolean {
  return PEXELS_KEY.length > 0
}

export async function searchBroll(query: string, perPage = 12): Promise<BrollClip[]> {
  if (!hasBrollKey()) {
    throw new Error('Sem chave do Pexels configurada (VITE_PEXELS_API_KEY).')
  }
  const params = new URLSearchParams({ query, per_page: String(perPage), orientation: 'landscape' })
  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: PEXELS_KEY },
  })
  if (!res.ok) throw new Error(`Erro na busca de B-roll (${res.status}).`)
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
