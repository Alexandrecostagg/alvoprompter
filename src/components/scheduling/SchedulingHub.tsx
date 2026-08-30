import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  CHANNELS,
  POST_STATUS_COLOR,
  POST_STATUS_LABEL,
  buildCaptionForChannel,
  channelInfo,
  formatPostDate,
  fromDateTimeLocal,
  isOverdue,
  listPosts,
  removePost,
  setPostStatus,
  syncPosts,
  toDateTimeLocal,
  upsertPost,
  whatsappShareUrl,
} from '../../lib/scheduling'
import { clearSyncPass, saveSyncPass, savedSyncPass } from '../../lib/syncWorker'
import { isShareCancelled, shareDataUrl, shareText } from '../../lib/share'
import { trackEvent } from '../../lib/stats'
import type { PostStatus, ScheduledPost, SocialChannel } from '../../lib/types'
import CalendarView from './CalendarView'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

function downloadDataUrl(dataUrl: string, name: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}

function mediaFileName(post: ScheduledPost): string {
  return post.mediaName ?? `alvoprompter-${post.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.webm`
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="text-3xl">📅</div>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Nenhum plano de publicação ainda. Prepare seu primeiro post multi-canal.
      </p>
      <button
        onClick={onCreate}
        className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-colors"
        style={{ background: 'var(--brand-gradient)', boxShadow: '0 5px 14px rgba(91,91,240,.35)' }}
      >
        ＋ Planejar publicação
      </button>
    </div>
  )
}

export default function SchedulingHub() {
  const recording = useAppStore((s) => s.recording)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [pass, setPass] = useState('')
  const [selected, setSelected] = useState<{ post: ScheduledPost; channel: SocialChannel } | null>(null)
  const [sharing, setSharing] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const connected = (savedSyncPass()?.length ?? 0) >= 12

  // form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [channels, setChannels] = useState<SocialChannel[]>(['youtube', 'instagram'])
  const [when, setWhen] = useState(() => toDateTimeLocal(Date.now() + 60 * 60 * 1000))
  const [tags, setTags] = useState('')
  const [mediaName, setMediaName] = useState('')
  const [mediaDataUrl, setMediaDataUrl] = useState('')

  const refresh = async () => {
    setPosts(await listPosts())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const openNew = () => {
    setShowForm(true)
    setMsg(null)
    setTitle('')
    setDescription('')
    setChannels(['youtube', 'instagram'])
    setWhen(toDateTimeLocal(Date.now() + 60 * 60 * 1000))
    setTags('')
    setMediaName('')
    setMediaDataUrl('')
  }

  const toggleChannel = (c: SocialChannel) => {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const pickFile = async (file: File) => {
    setMediaName(file.name)
    if (file.size <= 60 * 1024 * 1024) {
      setMediaDataUrl(await fileToDataUrl(file))
    } else {
      setMediaDataUrl('')
    }
  }

  const attachRecording = () => {
    if (!recording) return
    const ext = recording.blob.type.includes('mp4') ? 'mp4' : 'webm'
    setMediaName(`gravacao-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`)
    setMediaDataUrl('')
    void (async () => {
      setMediaDataUrl(await fileToDataUrl(new File([recording.blob], 'gravacao', { type: recording.blob.type })))
    })()
  }

  const save = async () => {
    if (!title.trim()) {
      setMsg({ type: 'err', text: 'Dê um título à publicação.' })
      return
    }
    if (!channels.length) {
      setMsg({ type: 'err', text: 'Selecione pelo menos um canal.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const scheduledAt = fromDateTimeLocal(when)
      await upsertPost({
        title: title.trim(),
        description: description.trim(),
        channels,
        scheduledAt,
        status: 'scheduled',
        mediaName: mediaName || undefined,
        mediaType: mediaDataUrl ? 'dataUrl' : undefined,
        mediaDataUrl: mediaDataUrl || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        scriptTitle: useAppStore.getState().currentScript?.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      setShowForm(false)
      setMsg({ type: 'ok', text: 'Plano de publicação salvo na agenda!' })
      await refresh()
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const mark = async (post: ScheduledPost, status: PostStatus) => {
    if (post.id != null) await setPostStatus(post.id, status)
    if (status === 'published') trackEvent('post_published')
    await refresh()
  }

  const del = async (post: ScheduledPost) => {
    if (!window.confirm(`Excluir o plano “${post.title}”?`)) return
    if (post.id != null) await removePost(post.id)
    await refresh()
  }

  const runSync = async () => {
    const p = savedSyncPass() ?? pass
    if (!p || p.trim().length < 12) {
      setMsg({ type: 'err', text: 'Use uma frase-chave com pelo menos 12 caracteres.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      saveSyncPass(p)
      const r = await syncPosts(p.trim())
      await refresh()
      setMsg({ type: 'ok', text: `Sincronizado: ${r.added} novo(s).` })
      setSyncOpen(false)
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const sorted = useMemo(
    () => [...posts].sort((a, b) => a.scheduledAt - b.scheduledAt),
    [posts],
  )

  const stats = useMemo(() => {
    const total = posts.length
    const published = posts.filter((p) => p.status === 'published').length
    const scheduled = posts.filter((p) => p.status === 'scheduled').length
    const overdue = posts.filter((p) => p.status === 'scheduled' && isOverdue(p)).length
    return { total, published, scheduled, overdue }
  }, [posts])

  const filtered = useMemo(() => {
    if (selectedDay == null) return sorted
    return sorted.filter((p) => {
      const a = new Date(p.scheduledAt)
      const b = new Date(selectedDay)
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      )
    })
  }, [sorted, selectedDay])

  const shareSelected = async () => {
    if (!selected || sharing) return
    const caption = buildCaptionForChannel(selected.post, selected.channel)
    setSharing(true)
    setMsg(null)
    try {
      const outcome = selected.post.mediaDataUrl
        ? await shareDataUrl(selected.post.mediaDataUrl, {
            fileName: mediaFileName(selected.post),
            title: selected.post.title,
            text: caption,
          })
        : await shareText(selected.post.title, caption)
      setMsg({
        type: 'ok',
        text: outcome === 'shared'
          ? `Compartilhamento aberto. Escolha ${channelInfo(selected.channel).label} e confirme por lá. A legenda também ficou copiada para você colar, se necessário.`
          : selected.post.mediaDataUrl
            ? 'Seu navegador baixou o vídeo e copiou a legenda. Abra a rede social para publicar.'
            : 'Legenda copiada. Abra a rede social para publicar.',
      })
    } catch (err) {
      if (!isShareCancelled(err)) setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agenda de publicação</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Organize data, vídeo e legenda. Na hora de publicar, use o compartilhamento do celular. {connected && '☁️ sync ativo.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSyncOpen((v) => !v)}
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            title="Sincronizar agendamentos por frase-chave"
          >
            ☁️ {connected ? 'sync' : 'Sincronizar'}
          </button>
          <button
            onClick={openNew}
            className="rounded-xl px-4 py-2 text-sm font-bold text-white transition-colors"
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 5px 14px rgba(91,91,240,.35)' }}
          >
            ＋ Planejar publicação
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 8%, var(--panel))' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--accent-2)' }}>↗ Publicação assistida</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          O AlvoPrompter prepara o conteúdo e abre Instagram, YouTube, TikTok ou outro app instalado. Você revisa e confirma a publicação na própria rede social.
        </p>
      </div>

      {syncOpen && (
        <div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {connected
              ? 'Planos sincronizados entre dispositivos com a mesma frase-chave.'
              : 'Use uma frase-chave para sincronizar a agenda entre dispositivos (sem cadastro).'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSync()
              }}
              placeholder="Frase-chave"
              minLength={12}
              className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', minWidth: 180 }}
            />
            <button
              onClick={() => void runSync()}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {busy ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
            {connected && (
              <button
                onClick={() => {
                  clearSyncPass()
                  setSyncOpen(false)
                  setMsg(null)
                }}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                Sair
              </button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.type === 'err' ? 'var(--danger)' : 'var(--ok)' }}>
          {msg.text}
        </p>
      )}

      {showForm && (
        <div className="mb-8 rounded-xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <h2 className="mb-4 text-lg font-semibold text-white">Planejar publicação</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Título
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: 5 erros de quem filma com o celular"
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Descrição / legenda
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Texto da legenda (o gerador de hashtags da IA está em Editor → IA)"
                className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Canais
              </label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const on = channels.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleChannel(c.id)}
                      className="rounded-lg border px-3 py-1.5 text-sm transition-colors"
                      style={{
                        borderColor: on ? c.color : 'var(--border)',
                        color: on ? c.color : 'var(--muted)',
                        background: on ? `${c.color}1a` : 'transparent',
                      }}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Data e hora
                </label>
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Hashtags (separadas por vírgula)
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="prompter, video, marketing"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Vídeo (opcional)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void pickFile(f)
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  🎬 Escolher vídeo
                </button>
                {recording && (
                  <button
                    onClick={attachRecording}
                    className="rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Usar última gravação do prompter
                  </button>
                )}
                {mediaName && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {mediaName} {mediaDataUrl ? '' : '(grande demais — só o nome será salvo)'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void save()}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                style={{ background: 'var(--accent)' }}
              >
                {busy ? 'Salvando…' : 'Salvar na agenda'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {!sorted.length && !showForm && <EmptyState onCreate={openNew} />}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>📋</span>
          <p className="text-2xl font-bold tabular-nums" style={{ letterSpacing: '-.5px' }}>{stats.total}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Total de planos</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: '#e5f6f1', color: 'var(--ok)' }}>✓</span>
          <p className="text-2xl font-bold tabular-nums" style={{ letterSpacing: '-.5px' }}>{stats.published}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Publicados</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--violet, #8052ff)' }}>📅</span>
          <p className="text-2xl font-bold tabular-nums" style={{ letterSpacing: '-.5px' }}>{stats.scheduled}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Planejados</p>
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: '#fdf3dd', color: '#b97a00' }}>⏰</span>
          <p className="text-2xl font-bold tabular-nums" style={{ letterSpacing: '-.5px' }}>{stats.overdue}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Atrasados</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold" style={{ letterSpacing: '-.2px' }}>
          <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: 'linear-gradient(135deg, var(--accent), var(--ok))' }} />
          {selectedDay ? 'Publicações do dia' : 'Próximas publicações'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDay != null && (
            <button
              onClick={() => setSelectedDay(null)}
              className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent-strong)' }}
            >
              Limpar dia
            </button>
          )}
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'plano' : 'planos'}
          </span>
          <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setView('list')}
              className="px-3 py-1.5 text-xs font-semibold"
              style={{ background: view === 'list' ? 'var(--accent)' : 'transparent', color: view === 'list' ? 'black' : 'var(--muted)' }}
            >
              Lista
            </button>
            <button
              onClick={() => setView('calendar')}
              className="px-3 py-1.5 text-xs font-semibold"
              style={{ background: view === 'calendar' ? 'var(--accent)' : 'transparent', color: view === 'calendar' ? 'black' : 'var(--muted)' }}
            >
              Calendário
            </button>
          </div>
        </div>
      </div>

      {view === 'calendar' && (
        <div className="mb-6">
          <CalendarView posts={posts} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </div>
      )}

      {filtered.length === 0 && posts.length > 0 && (
        <p className="mb-4 rounded-xl border p-4 text-center text-sm" style={{ borderColor: 'var(--border)', background: 'var(--panel)', color: 'var(--muted)' }}>
          Nenhuma publicação neste dia. Toque em outro dia ou em “Limpar dia”.
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((post) => (
          <div
            key={post.id ?? post.key}
            className="rounded-2xl border p-4 transition-shadow"
            style={{
              borderColor: isOverdue(post) ? 'var(--warn)' : 'var(--border)',
              background: 'var(--panel)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="hidden w-24 shrink-0 flex-col sm:flex" style={{ paddingRight: '0.9rem', borderRight: '1px solid var(--border)' }}>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent-strong)' }}>
                  {new Date(post.scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
                <span className="mt-0.5 text-[11px] font-semibold tabular-nums" style={{ color: 'var(--muted)' }}>
                  {new Date(post.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white">{post.title}</h3>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      color: POST_STATUS_COLOR[post.status],
                      background: `${POST_STATUS_COLOR[post.status]}1a`,
                    }}
                  >
                    {POST_STATUS_LABEL[post.status]}
                  </span>
                  {isOverdue(post) && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--warn)', background: 'var(--warn)1a' }}>
                      atrasado
                    </span>
                  )}
                </div>
                {post.description && (
                  <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--muted)' }}>
                    {post.description}
                  </p>
                )}
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                  🗓️ {formatPostDate(post.scheduledAt)}
                  {post.scriptTitle ? ` · 📝 ${post.scriptTitle}` : ''}
                  {post.mediaName ? ` · 🎬 ${post.mediaName}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {post.channels.map((c) => (
                    <span
                      key={c}
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ color: channelInfo(c).color, background: `${channelInfo(c).color}1a` }}
                    >
                      {channelInfo(c).label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelected({ post, channel: post.channels[0]! })}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  ↗ Publicar
                </button>
                {post.mediaDataUrl && (
                  <button
                    onClick={() => downloadDataUrl(post.mediaDataUrl!, mediaFileName(post))}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    ⬇️ Vídeo
                  </button>
                )}
                {post.status === 'scheduled' && (
                  <button
                    onClick={() => void mark(post, 'published')}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
                  >
                    ✓ Publicado
                  </button>
                )}
                <button
                  onClick={() => void del(post)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  🗑
                </button>
              </div>
              </div>
            </div>

            {selected?.post.id === post.id && selected && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    Publicar em {channelInfo(selected.channel).label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {post.channels.map((c) => (
                      <button
                        key={c}
                        onClick={() => setSelected({ post, channel: c })}
                        className="rounded-md px-2 py-1 text-[11px]"
                        style={{
                          background: c === selected.channel ? `${channelInfo(c).color}26` : 'transparent',
                          color: c === selected.channel ? channelInfo(c).color : 'var(--muted)',
                        }}
                      >
                        {channelInfo(c).label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  readOnly
                  value={buildCaptionForChannel(post, selected.channel)}
                  rows={5}
                  className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => void shareSelected()}
                    disabled={sharing}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    {sharing ? 'Preparando…' : `↗ Compartilhar ${post.mediaDataUrl ? 'vídeo + legenda' : 'legenda'}`}
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(buildCaptionForChannel(post, selected.channel))
                      setMsg({ type: 'ok', text: 'Legenda copiada!' })
                    }}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Copiar legenda
                  </button>
                  {selected.channel === 'whatsapp' && (
                    <a
                      href={whatsappShareUrl(post)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border px-3 py-1.5 text-xs"
                      style={{ borderColor: '#25D366', color: '#25D366' }}
                    >
                      Abrir no WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
