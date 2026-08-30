import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { dailyTotals, totals } from '../../lib/stats'

function fmt(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}min${s ? ` ${s}s` : ''}`
}

function fmtDay(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso.slice(5)
  }
}

export default function MetricsPanel() {
  const setView = useAppStore((s) => s.setView)
  const total = useMemo(() => totals(), [])
  const daily = useMemo(() => dailyTotals(14), [])

  const activities = daily.map((d) => ({
    ...d,
    count: d.scripts + d.recordings + d.exports + d.shares + d.pages + d.published,
  }))
  const maxCount = Math.max(1, ...activities.map((a) => a.count))

  const cards = [
    { label: 'Roteiros', value: String(total.scripts), icon: '📝' },
    { label: 'Gravações', value: String(total.recordings), icon: '🎥' },
    { label: 'Tempo gravado', value: fmt(total.recordSeconds), icon: '⏱️' },
    { label: 'Edições (export)', value: String(total.exports), icon: '🎬' },
    { label: 'Compartilhamentos', value: String(total.shares), icon: '↗️' },
    { label: 'Páginas de vídeo', value: String(total.pages), icon: '📄' },
    { label: 'Publicações', value: String(total.published), icon: '📅' },
  ]

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--text)' }}>Métricas</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Seu uso registrado neste aparelho. Nenhum dado sai do dispositivo — os contadores são locais.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border p-4"
              style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}
            >
              <p className="text-2xl" aria-hidden>{card.icon}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{card.value}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{card.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>Atividade dos últimos 14 dias</h2>
          <div className="flex h-40 items-end gap-1">
            {activities.map((a) => (
              <div key={a.day} className="group relative flex flex-1 flex-col items-center gap-1" title={`${fmtDay(a.day)}: ${a.count} ações`}>
                <div
                  className="w-full rounded-t-md transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${Math.max(4, (a.count / maxCount) * 100)}%`,
                    background: a.count > 0 ? 'var(--accent)' : 'var(--border)',
                  }}
                />
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtDay(a.day)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setView('library')}
            className="rounded-xl border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            ← Voltar
          </button>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Visualizações de páginas de vídeo são contadas pela página pública (servidor).
          </p>
        </div>
      </div>
    </div>
  )
}
