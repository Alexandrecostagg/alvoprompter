import { db, getPosts, savePost, deletePost } from './db'
import { pullPostsCloud, pushPostsCloud, type SerializablePost } from './syncWorker'
import type { ScheduledPost, SocialChannel } from './types'

export interface ChannelInfo {
  id: SocialChannel
  label: string
  color: string
  /** Limite de caracteres de caption (aproximado). */
  captionLimit: number
}

export const CHANNELS: ChannelInfo[] = [
  { id: 'youtube', label: 'YouTube', color: '#FF0000', captionLimit: 5000 },
  { id: 'instagram', label: 'Instagram', color: '#E4405F', captionLimit: 2200 },
  { id: 'tiktok', label: 'TikTok', color: '#010101', captionLimit: 2200 },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', captionLimit: 3000 },
  { id: 'x', label: 'X', color: '#111111', captionLimit: 280 },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', captionLimit: 4096 },
]

export function channelInfo(id: SocialChannel): ChannelInfo {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0]!
}

export const POST_STATUS_LABEL: Record<ScheduledPost['status'], string> = {
  scheduled: 'Planejado',
  published: 'Publicado',
  cancelled: 'Cancelado',
  failed: 'Falhou',
}

export const POST_STATUS_COLOR: Record<ScheduledPost['status'], string> = {
  scheduled: 'var(--accent)',
  published: 'var(--ok)',
  cancelled: 'var(--muted)',
  failed: 'var(--danger)',
}

export function formatPostDate(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): number {
  return new Date(value).getTime()
}

function hashtags(post: ScheduledPost): string {
  const tags = (post.tags ?? []).filter(Boolean)
  return tags.length ? `\n\n${tags.map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`)).join(' ')}` : ''
}

/** Monta o texto pronto para cada canal (título + descrição + hashtags). */
export function buildCaptionForChannel(post: ScheduledPost, channel: SocialChannel): string {
  const info = channelInfo(channel)
  const base = post.description.trim()
  const ht = hashtags(post)

  switch (channel) {
    case 'youtube':
      return [
        post.title.trim(),
        base,
        ht.trim() ? `${ht.trim()}\n\n` : '',
        `🎬 Criado com AlvoPrompter — seu roteiro no alvo. Seu olhar na câmera.`,
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'x':
      return `${base}${ht}`.trim().slice(0, info.captionLimit)
    case 'instagram':
      return [`${base}${ht}`, `📲 Salve e compartilhe com quem precisa!`].filter(Boolean).join('\n\n')
    case 'tiktok':
      return `${base}${ht}`.trim()
    case 'linkedin':
      return [
        post.title.trim(),
        base,
        ht.trim() ? ht.trim() : '',
        '',
        '— Gerado com AlvoPrompter 🎥',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'whatsapp':
      return [`*${post.title.trim()}*`, base, ht.trim() ? ht.trim() : ''].filter(Boolean).join('\n\n')
  }
}

/** Link para compartilhar via WhatsApp. */
export function whatsappShareUrl(post: ScheduledPost): string {
  const text = buildCaptionForChannel(post, 'whatsapp')
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function isOverdue(post: ScheduledPost): boolean {
  return post.status === 'scheduled' && post.scheduledAt < Date.now()
}

// ---- CRUD ----

export async function listPosts(): Promise<ScheduledPost[]> {
  return getPosts()
}

export async function upsertPost(post: ScheduledPost): Promise<number> {
  return savePost(post)
}

export async function removePost(id: number): Promise<void> {
  await deletePost(id)
}

export async function setPostStatus(id: number, status: ScheduledPost['status']): Promise<void> {
  const post = await db.posts.get(id)
  if (!post) return
  await savePost({ ...post, status, updatedAt: Date.now() })
}

function toSerializable(post: ScheduledPost): SerializablePost {
  return {
    key: post.key ?? '',
    title: post.title,
    description: post.description,
    channels: post.channels,
    scheduledAt: post.scheduledAt,
    status: post.status,
    mediaName: post.mediaName ?? '',
    mediaType: post.mediaType ?? '',
    scriptTitle: post.scriptTitle ?? '',
    tags: post.tags ?? [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

/** Merge local + nuvem por key (o mais recente vence) e publica o resultado. */
export async function syncPosts(pass: string): Promise<{ added: number }> {
  const cloud = await pullPostsCloud(pass)
  const local = await getPosts()
  const merged = new Map<string, ScheduledPost>()
  for (const p of local) {
    if (p.key) merged.set(p.key, p)
  }
  let added = 0
  for (const c of cloud) {
    const existing = merged.get(c.key)
    if (!existing) {
      merged.set(c.key, {
        ...(c as unknown as ScheduledPost),
        id: undefined,
        mediaDataUrl: undefined,
      })
      added++
    } else if (c.updatedAt > existing.updatedAt) {
      merged.set(c.key, {
        ...existing,
        title: c.title,
        description: c.description,
        channels: c.channels as SocialChannel[],
        scheduledAt: c.scheduledAt,
        status: c.status as ScheduledPost['status'],
        mediaName: c.mediaName,
        mediaType: c.mediaType,
        scriptTitle: c.scriptTitle,
        tags: c.tags,
        updatedAt: c.updatedAt,
      })
    }
  }
  const final = [...merged.values()]
  await db.transaction('rw', db.posts, async () => {
    await db.posts.clear()
    await db.posts.bulkAdd(final)
  })
  await pushPostsCloud(
    pass,
    final.map((p) => toSerializable(p)),
  )
  return { added }
}
