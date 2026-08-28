import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { AiPanelTab } from '../../lib/types'
import {
  generateScript,
  improveScript,
  suggestTitlesAndHooks,
  type ImproveAction,
  type TitlesAndHooks,
} from '../../lib/ai'

const FORMATS = [
  'TikTok / Reels (até 1 min)',
  'YouTube Shorts (até 60s)',
  'YouTube (5+ min)',
  'Vídeo de vendas',
  'Vlog',
  'Pregação / Culto',
  'Curso / Treinamento',
  'Anúncio / Apresentação',
  'Testemunho',
  'Outro',
]

const TONES = [
  'Casual e próximo',
  'Energético',
  'Profissional',
  'Emocional',
  'Humorístico',
  'Motivacional',
  'Direto ao ponto',
  'Inspirador',
]

const DURATIONS = ['~30 segundos', '~1 minuto', '~2 minutos', '~5 minutos', '~10 minutos']

const IMPROVE_ACTIONS: { value: ImproveAction; label: string }[] = [
  { value: 'fluencia', label: 'Deixar mais fluido para leitura' },
  { value: 'encurtar', label: 'Encurtar pela metade' },
  { value: 'gancho', label: 'Fortalecer o gancho inicial' },
  { value: 'tom', label: 'Ajustar o tom' },
]

interface AiPanelProps {
  tab: AiPanelTab
}

export default function AiPanel({ tab }: AiPanelProps) {
  const { currentScript, selectScript, upsertScript, closeAiPanel } = useAppStore()
  const [activeTab, setActiveTab] = useState<AiPanelTab>(tab)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => setActiveTab(tab), [tab])

  useEffect(() => () => abortRef.current?.abort(), [])

  // ---- Gerar roteiro ----
  const [topic, setTopic] = useState('')
  const [format, setFormat] = useState(FORMATS[0])
  const [tone, setTone] = useState(TONES[0])
  const [duration, setDuration] = useState(DURATIONS[1])
  const [audience, setAudience] = useState('')
  const [notes, setNotes] = useState('')
  const [generated, setGenerated] = useState('')
  const [generating, setGenerating] = useState(false)

  // ---- Melhorar ----
  const [improveAction, setImproveAction] = useState<ImproveAction>('fluencia')
  const [toneInstruction, setToneInstruction] = useState('')
  const [improved, setImproved] = useState('')
  const [improving, setImproving] = useState(false)

  // ---- Títulos & ganchos ----
  const [suggestions, setSuggestions] = useState<TitlesAndHooks | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setGenerating(false)
    setImproving(false)
    setSuggesting(false)
  }

  const handleGenerate = async () => {
    if (!topic.trim() || busy) return
    setError(null)
    setBusy(true)
    setGenerating(true)
    setGenerated('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await generateScript(
        {
          topic: topic.trim(),
          format,
          tone,
          duration,
          audience: audience.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        { onToken: (full) => setGenerated(full), signal: controller.signal },
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setBusy(false)
      setGenerating(false)
      abortRef.current = null
    }
  }

  const handleImprove = async () => {
    if (!currentScript?.content.trim() || busy) return
    setError(null)
    setBusy(true)
    setImproving(true)
    setImproved('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await improveScript(
        currentScript.content,
        improveAction,
        {
          onToken: (full) => setImproved(full),
          signal: controller.signal,
          toneInstruction,
        },
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setBusy(false)
      setImproving(false)
      abortRef.current = null
    }
  }

  const handleSuggest = async () => {
    if (!currentScript?.content.trim() || busy) return
    setError(null)
    setBusy(true)
    setSuggesting(true)
    setSuggestions(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await suggestTitlesAndHooks(currentScript.content, { signal: controller.signal })
      setSuggestions(result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setBusy(false)
      setSuggesting(false)
      abortRef.current = null
    }
  }

  const applyToScript = (text: string) => {
    if (!currentScript) return
    const next = { ...currentScript, content: text }
    selectScript(next)
    void upsertScript(next)
    closeAiPanel()
  }

  const copyItem = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(key)
      window.setTimeout(() => setCopiedIndex(null), 1500)
    } catch {
      setError('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }

  const tabButton = (value: AiPanelTab, label: string) => (
    <button
      key={value}
      onClick={() => setActiveTab(value)}
      className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: activeTab === value ? 'var(--accent)' : 'transparent',
        color: activeTab === value ? 'black' : 'var(--muted)',
      }}
    >
      {label}
    </button>
  )

  const primaryBtn = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg py-2.5 text-sm font-semibold text-black disabled:opacity-40"
      style={{ background: 'var(--accent)' }}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="flex h-full w-full max-w-md flex-col border-l"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold text-white">✨ Assistente IA</h2>
          <button
            onClick={closeAiPanel}
            className="rounded-lg border px-3 py-1 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Fechar (Esc)
          </button>
        </div>

        <div
          className="mx-5 mt-4 flex rounded-lg border p-1"
          style={{ borderColor: 'var(--border)' }}
        >
          {tabButton('generate', 'Gerar roteiro')}
          {tabButton('improve', 'Melhorar')}
          {tabButton('titles', 'Títulos & ganchos')}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'rgba(248,113,113,0.08)' }}
            >
              {error}
            </div>
          )}

          {activeTab === 'generate' && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Tema do vídeo *
                </span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ex.: 5 erros de quem começa no TikTok"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Formato
                  </span>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm text-white"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f} style={{ background: 'var(--panel)' }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Tom
                  </span>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm text-white"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t} style={{ background: 'var(--panel)' }}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Duração
                </span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm text-white"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d} style={{ background: 'var(--panel)' }}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Público-alvo (opcional)
                </span>
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Ex.: pastores e líderes de louvor"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Observações (opcional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pontos que o roteiro precisa cobrir, referências, CTA..."
                  rows={3}
                  className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </label>
              {generating || generated ? (
                <>
                  <textarea
                    readOnly
                    value={generated}
                    rows={10}
                    placeholder="O roteiro aparecerá aqui enquanto a IA escreve..."
                    className="w-full resize-none rounded-lg border p-3 text-sm leading-relaxed text-white"
                    style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
                  />
                  <div className="flex gap-2">
                    {generating ? (
                      <button
                        onClick={cancel}
                        className="flex-1 rounded-lg border py-2.5 text-sm"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        Cancelar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setGenerated('')}
                          className="flex-1 rounded-lg border py-2.5 text-sm"
                          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                        >
                          Descartar
                        </button>
                        <button
                          onClick={() => applyToScript(generated)}
                          className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-black"
                          style={{ background: 'var(--ok)' }}
                        >
                          Usar este roteiro
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                primaryBtn('✨ Gerar roteiro', handleGenerate, !topic.trim() || busy)
              )}
            </>
          )}

          {activeTab === 'improve' && (
            <>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Melhora o roteiro atual ({(currentScript?.content ?? '').trim() ? 'com conteúdo' : 'vazio'}
                ). A prévia aparece antes de aplicar.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Ação
                </span>
                <select
                  value={improveAction}
                  onChange={(e) => setImproveAction(e.target.value as ImproveAction)}
                  className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm text-white"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {IMPROVE_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value} style={{ background: 'var(--panel)' }}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {improveAction === 'tom' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Para que tom?
                  </span>
                  <input
                    value={toneInstruction}
                    onChange={(e) => setToneInstruction(e.target.value)}
                    placeholder="Ex.: mais empolgante, como um youtuber"
                    className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-white outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </label>
              )}
              {improving || improved ? (
                <>
                  <textarea
                    readOnly
                    value={improved}
                    rows={10}
                    placeholder="O roteiro melhorado aparecerá aqui..."
                    className="w-full resize-none rounded-lg border p-3 text-sm leading-relaxed text-white"
                    style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
                  />
                  <div className="flex gap-2">
                    {improving ? (
                      <button
                        onClick={cancel}
                        className="flex-1 rounded-lg border py-2.5 text-sm"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        Cancelar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setImproved('')}
                          className="flex-1 rounded-lg border py-2.5 text-sm"
                          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                        >
                          Descartar
                        </button>
                        <button
                          onClick={() => applyToScript(improved)}
                          className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-black"
                          style={{ background: 'var(--ok)' }}
                        >
                          Aplicar ao roteiro
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                primaryBtn(
                  '✨ Melhorar roteiro',
                  handleImprove,
                  !currentScript?.content.trim() || busy,
                )
              )}
            </>
          )}

          {activeTab === 'titles' && (
            <>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Gera 5 títulos, 5 ganchos de abertura e 12 hashtags para o roteiro atual. Clique para copiar.
              </p>
              {suggesting ? (
                <p className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  Pensando em ideias...
                </p>
              ) : suggestions ? (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                    Títulos
                  </h3>
                  <ul className="space-y-2">
                    {suggestions.titles.map((t, i) => (
                      <li key={i}>
                        <button
                          onClick={() => copyItem(`t${i}`, t)}
                          className="w-full rounded-lg border px-3 py-2 text-left text-sm text-white transition-colors"
                          style={{
                            borderColor: copiedIndex === `t${i}` ? 'var(--ok)' : 'var(--border)',
                            background: copiedIndex === `t${i}` ? 'rgba(52,211,153,0.08)' : 'var(--panel)',
                          }}
                        >
                          {copiedIndex === `t${i}` ? '✓ Copiado!' : t}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                    Ganchos de abertura
                  </h3>
                  <ul className="space-y-2">
                    {suggestions.hooks.map((h, i) => (
                      <li key={i}>
                        <button
                          onClick={() => copyItem(`h${i}`, h)}
                          className="w-full rounded-lg border px-3 py-2 text-left text-sm text-white transition-colors"
                          style={{
                            borderColor: copiedIndex === `h${i}` ? 'var(--ok)' : 'var(--border)',
                            background: copiedIndex === `h${i}` ? 'rgba(52,211,153,0.08)' : 'var(--panel)',
                          }}
                        >
                          {copiedIndex === `h${i}` ? '✓ Copiado!' : h}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {suggestions.hashtags.length > 0 && (
                    <>
                      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
                        Hashtags
                      </h3>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {suggestions.hashtags.map((tag, i) => (
                          <button
                            key={i}
                            onClick={() => copyItem(`tag${i}`, tag)}
                            className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                            style={{
                              borderColor: copiedIndex === `tag${i}` ? 'var(--ok)' : 'var(--border)',
                              color: copiedIndex === `tag${i}` ? 'var(--ok)' : 'var(--accent-2)',
                            }}
                          >
                            {copiedIndex === `tag${i}` ? '✓' : tag}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                primaryBtn('✨ Sugerir títulos, ganchos e hashtags', handleSuggest, !currentScript?.content.trim() || busy)
              )}
            </>
          )}
        </div>
      </div>
      <button
        aria-label="Fechar assistente IA"
        onClick={closeAiPanel}
        className="absolute inset-0 -z-10 cursor-default"
      />
    </div>
  )
}
