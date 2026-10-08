import { useMemo, useState } from 'react'
import { findFillers, readingStats, removeFillers } from '../../lib/text'
import { formatElapsed } from '../../hooks/useRecorder'

interface ScriptAnalysisProps {
  content: string
  wpm: number
  onApplyClean: (text: string) => void
  onClose: () => void
}

export default function ScriptAnalysis({ content, wpm, onApplyClean, onClose }: ScriptAnalysisProps) {
  const [confirmClean, setConfirmClean] = useState(false)
  const [confirmMarkers, setConfirmMarkers] = useState(false)

  const stats = useMemo(() => readingStats(content, wpm), [content, wpm])

  const fillers = useMemo(() => {
    const matches = findFillers(content)
    const byWord = new Map<string, { count: number; removable: boolean }>()
    for (const m of matches) {
      const cur = byWord.get(m.word)
      if (cur) cur.count++
      else byWord.set(m.word, { count: 1, removable: m.removable })
    }
    return {
      total: matches.length,
      words: [...byWord.entries()].sort((a, b) => b[1].count - a[1].count),
      removableCount: matches.filter((m) => m.removable).length,
    }
  }, [content])

  const clean = (includeMarkers: boolean) => {
    const next = removeFillers(content, includeMarkers)
    onApplyClean(next)
    onClose()
  }

  const chip = (label: string, removable: boolean) => (
    <span
      key={label}
      className="rounded-full border px-2 py-0.5 text-xs"
      style={{
        borderColor: removable ? 'var(--warn)' : 'var(--border)',
        color: removable ? 'var(--warn)' : 'var(--muted)',
        background: removable ? 'rgba(251,191,36,0.08)' : 'transparent',
      }}
    >
      {label}
    </span>
  )

  return (
    <div
      className="mt-3 rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold ">Análise do roteiro</h3>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--muted)' }}
        >
          Ocultar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Palavras</p>
          <p className="mt-0.5 text-lg font-semibold ">{stats.words}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Frases</p>
          <p className="mt-0.5 text-lg font-semibold ">{stats.sentences}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Média por frase</p>
          <p className="mt-0.5 text-lg font-semibold ">{stats.avgWordsPerSentence}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Duração ({wpm} wpm)</p>
          <p className="mt-0.5 text-lg font-semibold ">
            {formatElapsed(stats.durationMinutes * 60)}
          </p>
        </div>
      </div>

      {stats.keywords.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            Palavras-chave
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.keywords.map((k) => (
              <span
                key={k.word}
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent)' }}
              >
                {k.word} · {k.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium ">
              Vícios de linguagem{' '}
              {fillers.total > 0 && (
                <span
                  className="ml-1 rounded-full px-2 py-0.5 text-xs"
                  style={{
                    background: fillers.total > 5 ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.12)',
                    color: fillers.total > 5 ? 'var(--danger)' : 'var(--warn)',
                  }}
                >
                  {fillers.total} encontrados
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              Marcadores como "tipo" e "sabe" podem ser intencionais — revise antes de remover.
            </p>
          </div>
          {fillers.total > 0 && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={() => {
                  if (confirmClean) clean(false)
                  else setConfirmClean(true)
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black"
                style={{ background: 'var(--accent)' }}
              >
                {confirmClean ? 'Confirmar remoção?' : `Remover vícios (${fillers.removableCount})`}
              </button>
              <button
                onClick={() => {
                  if (confirmMarkers) clean(true)
                  else setConfirmMarkers(true)
                }}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                {confirmMarkers ? 'Confirmar? (todos)' : 'Remover vícios e marcadores'}
              </button>
            </div>
          )}
        </div>
        {fillers.words.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {fillers.words.map(([label, info]) => chip(label, info.removable))}
          </div>
        )}
      </div>
    </div>
  )
}
