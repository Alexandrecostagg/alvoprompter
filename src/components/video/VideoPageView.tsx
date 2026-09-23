import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { apiBase } from '../../lib/cloudflare'
import { fetchVideoPage, videoPageQueryId, videoPageShareUrl, type VideoPage } from '../../lib/videopage'
import { trackVideoView } from '../../lib/stats'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function VideoPageView() {
  const setView = useAppStore((s) => s.setView)
  const [id] = useState<string | null>(() => videoPageQueryId())
  const [page, setPage] = useState<VideoPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [views, setViews] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) {
      setError('Link de página de vídeo inválido.')
      return
    }
    let active = true
    void fetchVideoPage(id)
      .then((p) => {
        if (!active) return
        setPage(p)
        setViews(p.views)
      })
      .catch((err) => active && setError((err as Error).message))
    return () => {
      active = false
    }
  }, [id])

  const handleShare = async () => {
    if (!page) return
    const url = videoPageShareUrl(page.id)
    try {
      if (navigator.share) {
        await navigator.share({ title: page.title, text: page.description, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // compartilhamento cancelado pelo usuário
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePlay = () => {
    setPlaying(true)
    if (page && trackVideoView(page.id)) setViews((v) => v + 1)
  }

  if (error) {
    return (
      <div className="grid min-h-[60dvh] place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="mb-3 text-4xl" aria-hidden>🎬</p>
          <h1 className="mb-2 text-lg font-semibold text-white on-dark">Página não encontrada</h1>
          <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>{error}</p>
          <button
            onClick={() => setView('library')}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-black"
            style={{ background: 'var(--accent)' }}
          >
            Voltar para a biblioteca
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70dvh] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div
          className="relative overflow-hidden rounded-3xl border"
          style={{
            borderColor: 'var(--border)',
            background: 'linear-gradient(160deg, #1c2540, #0e0a1a 70%)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30" style={{ background: 'var(--accent)' }} />
          <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full opacity-20" style={{ background: 'var(--accent-2)' }} />
          <div className="relative p-5 sm:p-8">
            {!page ? (
              <div className="flex aspect-video w-full items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                Carregando página de vídeo…
              </div>
            ) : playing ? (
              <video
                src={`${apiBase()}${page.videoUrl}`}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full rounded-2xl bg-black"
              />
            ) : (
              <button
                onClick={handlePlay}
                aria-label="Assistir vídeo"
                className="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-black/50"
              >
                <div className="absolute inset-0 grid place-items-center">
                  <span
                    className="grid h-20 w-20 place-items-center rounded-full text-3xl text-white transition-transform group-hover:scale-110"
                    style={{ background: 'var(--brand-gradient)', boxShadow: '0 10px 30px rgba(128,82,255,.5)' }}
                  >
                    ▶
                  </span>
                </div>
              </button>
            )}

            <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white on-dark">{page?.title}</h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  {page?.author ? `Por ${page.author} · ` : ''}
                  {page?.createdAt ? formatDate(page.createdAt) : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                  title="Visualizações registradas neste aparelho e na página pública"
                >
                  👁 {views} visualizações
                </span>
                <button
                  onClick={() => void handleShare()}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-black"
                  style={{ background: 'var(--accent)' }}
                >
                  {copied ? '✓ Link copiado' : '↗ Compartilhar'}
                </button>
              </div>
            </div>

            {page?.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white on-dark">{page.description}</p>
            ) : null}

            <button
              onClick={() => setView('library')}
              className="mt-6 rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              ← Voltar para a biblioteca
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
