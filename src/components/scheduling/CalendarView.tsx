import { useMemo, useState } from 'react'
import type { ScheduledPost } from '../../lib/types'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function sameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

interface CalendarViewProps {
  posts: ScheduledPost[]
  selectedDay: number | null
  onSelectDay: (ts: number | null) => void
}

export default function CalendarView({ posts, selectedDay, onSelectDay }: CalendarViewProps) {
  const [monthOffset, setMonthOffset] = useState(0)

  const { year, month } = useMemo(() => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + monthOffset)
    return { year: base.getFullYear(), month: base.getMonth() }
  }, [monthOffset])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const startDow = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leads = Array.from({ length: startDow }, () => null)
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1).getTime())
    return [...leads, ...days]
  }, [year, month])

  const postDays = useMemo(() => {
    const set = new Set<number>()
    for (const p of posts) set.add(new Date(p.scheduledAt).setHours(0, 0, 0, 0))
    return set
  }, [posts])

  const today = new Date()
  const canPrev = !(month === today.getMonth() && year === today.getFullYear())

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ letterSpacing: '-.2px' }}>
          {MONTHS_PT[month]} {year}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            disabled={!canPrev}
            className="grid h-8 w-8 place-items-center rounded-lg border text-sm disabled:opacity-35"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-35"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            disabled={monthOffset === 0}
          >
            Hoje
          </button>
          <button
            onClick={() => setMonthOffset((o) => o + 1)}
            className="grid h-8 w-8 place-items-center rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-center text-[10px] font-bold uppercase" style={{ color: 'var(--muted)' }}>
            {w}
          </span>
        ))}
        {cells.map((ts, i) => {
          if (ts == null) return <span key={`b${i}`} />
          const d = new Date(ts)
          const isToday = sameDay(ts, Date.now())
          const isSelected = selectedDay != null && sameDay(ts, selectedDay)
          const has = postDays.has(d.setHours(0, 0, 0, 0))
          return (
            <button
              key={ts}
              onClick={() => onSelectDay(isSelected ? null : ts)}
              className="relative grid h-9 place-items-center rounded-lg text-xs font-medium transition-colors"
              style={
                isToday
                  ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', color: '#fff', fontWeight: 700 }
                  : isSelected
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontWeight: 700 }
                    : { color: 'var(--ink-soft)' }
              }
              title={has ? 'Tem publicação' : undefined}
            >
              {d.getDate()}
              {has && (
                <span
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{ background: isToday || isSelected ? 'var(--accent-2)' : 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[11px]" style={{ color: 'var(--muted)' }}>
        Toque em um dia para ver as publicações. Pontos indicam dias com conteúdo planejado.
      </p>
    </div>
  )
}
