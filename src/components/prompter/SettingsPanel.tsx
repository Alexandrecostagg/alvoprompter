import { useModalFocus } from '../../hooks/useModalFocus'
import { Children, cloneElement, isValidElement, useId, useRef, useState, type ReactElement } from 'react'
import type { PrompterSettings } from '../../lib/types'
import { BEAUTY_OPTIONS } from '../../lib/beauty'
import { searchBroll, type BrollClip } from '../../lib/broll'
import { useAppStore } from '../../store/useAppStore'

const FONT_OPTIONS = [
  { value: 'system-ui, -apple-system, sans-serif', label: 'Padrão (Sans)' },
  { value: 'OpenDyslexic, sans-serif', label: 'OpenDyslexic (dislexia)' },
  { value: 'Lexend, sans-serif', label: 'Lexend (leitura fácil)' },
  { value: 'Georgia, serif', label: 'Serifa (Georgia)' },
]

const VOICE_LANGS = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'pt-PT', label: 'Português (PT)' },
  { code: 'en-US', label: 'Inglês (US)' },
  { code: 'en-GB', label: 'Inglês (UK)' },
  { code: 'es-ES', label: 'Espanhol (ES)' },
  { code: 'es-419', label: 'Espanhol (LatAm)' },
  { code: 'fr-FR', label: 'Francês' },
  { code: 'de-DE', label: 'Alemão' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'ja-JP', label: 'Japonês' },
  { code: 'zh-CN', label: 'Chinês (Simplificado)' },
]

interface SettingsPanelProps {
  settings: PrompterSettings
  wordCount: number
  isRecording?: boolean
  filterUnavailable?: boolean
  onClose: () => void
  cameraUsesAutomaticScroll?: boolean
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="settings-row flex flex-col items-stretch gap-3 py-4">
      <span id={id} className="text-sm" style={{ color: 'var(--text)' }}>
        {label}
      </span>
      <div className="flex w-full items-center gap-2">{Children.map(children, child => isValidElement(child) ? cloneElement(child as ReactElement<{ 'aria-labelledby'?: string }>, { 'aria-labelledby': id }) : child)}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  'aria-labelledby': labelledBy,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  'aria-labelledby'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-labelledby={labelledBy}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-11 w-16 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--border)' }}
    >
      <span
        className="absolute top-2 h-7 w-7 rounded-full bg-white transition-all"
        style={{ left: checked ? 'calc(100% - 34px)' : '6px' }}
      />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className={`w-full gap-1 rounded-xl border p-1 ${options.length === 4 ? 'grid grid-cols-2' : 'flex flex-wrap'}`} style={{ borderColor: 'var(--border)' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          aria-label={opt.label}
          aria-pressed={value === opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="min-h-11 min-w-0 grow rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
          style={{
            background: value === opt.value ? 'var(--accent-soft)' : 'transparent',
            color: value === opt.value ? 'var(--brand-strong)' : 'var(--text)', boxShadow: value === opt.value ? 'inset 0 0 0 1px var(--brand-strong)' : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function TouchSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const change = (delta: number) => onChange(Math.max(min, Math.min(max, Math.round((value + delta) * 100) / 100)))
  return <div className="flex w-full items-center gap-3">
    <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => change(-step)} className="h-11 w-11 shrink-0 rounded-xl border text-xl font-bold disabled:opacity-35" style={{borderColor:'var(--border)'}}>−</button>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} className="min-w-0 flex-1" />
    <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => change(step)} className="h-11 w-11 shrink-0 rounded-xl border text-xl font-bold disabled:opacity-35" style={{borderColor:'var(--border)'}}>+</button>
  </div>
}

export default function SettingsPanel({ settings, wordCount, isRecording = false, filterUnavailable = false, cameraUsesAutomaticScroll = false, onClose }: SettingsPanelProps) {
  const [category, setCategory] = useState<'camera' | 'reading' | 'text' | 'background'>('camera')
  const scrollRef = useRef<HTMLDivElement>(null)
  const categories = [{ id:'camera', label:'Câmera' }, { id:'reading', label:'Leitura' }, { id:'text', label:'Texto' }, { id:'background', label:'Fundo' }] as const
  const modalRef = useRef<HTMLDivElement>(null)
  useModalFocus(modalRef, true, onClose)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const resetSettings = useAppStore((s) => s.resetSettings)
  const bgFileRef = useRef<HTMLInputElement>(null)
  const brollFileRef = useRef<HTMLInputElement>(null)
  const [brollQuery, setBrollQuery] = useState('')
  const [brollResults, setBrollResults] = useState<BrollClip[]>([])
  const [brollBusy, setBrollBusy] = useState(false)
  const [brollError, setBrollError] = useState<string | null>(null)
  const [showBrollUrl, setShowBrollUrl] = useState(false)
  const [brollUrl, setBrollUrl] = useState('')

  const pickBgImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => updateSettings({ bgImage: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const pickBrollFile = (file: File) => {
    updateSettings({ bgVideo: URL.createObjectURL(file) })
  }

  const runBrollSearch = async () => {
    const q = brollQuery.trim()
    if (!q || brollBusy) return
    setBrollBusy(true)
    setBrollError(null)
    try {
      setBrollResults(await searchBroll(q))
    } catch (err) {
      setBrollError((err as Error).message)
      setBrollResults([])
    } finally {
      setBrollBusy(false)
    }
  }

  return (
    <div ref={modalRef} className="prompter-settings-overlay fixed inset-0 z-40 flex items-end sm:justify-end" role="dialog" aria-modal="true" id="recording-settings" aria-label="Ajustes de gravação">
      <button tabIndex={-1} aria-label="Fechar configurações" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 flex settings-sheet w-full flex-col rounded-t-[2rem] border sm:h-full sm:max-w-lg sm:rounded-none sm:border-l" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <span className="mx-auto mt-3 block h-1 w-12 rounded-full sm:hidden" style={{ background: 'var(--border)' }} aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div><h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Prepare sua gravação</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>As alterações são salvas na hora.</p></div>
          <button
            onClick={onClose}
            className="min-h-11 rounded-xl border px-4 text-sm font-semibold"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Concluir
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-4 gap-1 border-b px-4 py-3" role="tablist" aria-label="Categorias de ajustes" style={{ borderColor: 'var(--border)' }}>
          {categories.map((item, index) => <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab"
            data-dialog-autofocus={index === 0 ? '' : undefined} aria-selected={category === item.id} aria-controls={`settings-${item.id}`} tabIndex={category === item.id ? 0 : -1}
            onClick={() => { setCategory(item.id); scrollRef.current?.scrollTo({top:0}) }}
            onKeyDown={(event) => {
              let next = index
              if (event.key === 'ArrowRight') next = (index + 1) % categories.length
              else if (event.key === 'ArrowLeft') next = (index + categories.length - 1) % categories.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = categories.length - 1
              else return
              event.preventDefault(); setCategory(categories[next].id); scrollRef.current?.scrollTo({top:0})
              document.getElementById(`settings-tab-${categories[next].id}`)?.focus()
            }}
            className="min-h-12 rounded-xl px-1 text-sm font-bold transition-colors"
            style={{ color: category === item.id ? 'var(--brand-strong)' : 'var(--muted)', background: category === item.id ? 'var(--accent-soft)' : 'transparent', boxShadow: category === item.id ? 'inset 0 -3px var(--brand-strong)' : undefined }}>
            {item.label}
          </button>)}
        </div>
        {(category === 'text' || category === 'reading') && <div className="prompter-settings-preview mx-5 mt-4 shrink-0 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: settings.bgColor }} aria-label="Prévia do texto do prompter">
          <p className="break-words whitespace-normal text-center" style={{ color: settings.fontColor, fontFamily: settings.fontFamily, fontSize: Math.max(16, Math.min(settings.fontSize / 2, 48)), lineHeight: settings.lineHeight, letterSpacing: settings.letterSpacing, transform: settings.mirror ? 'scaleX(-1)' : undefined }}>Seu texto, no seu ritmo.</p>
        </div>}
        <div ref={scrollRef} className="settings-content min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <section id="settings-camera" role="tabpanel" aria-labelledby="settings-tab-camera" hidden={category !== 'camera'} tabIndex={0}>
            {isRecording && <p className="settings-notice">A gravação está em andamento. Pare a tomada para alterar câmera, enquadramento ou filtro.</p>}
            <fieldset disabled={isRecording} className="min-w-0 disabled:opacity-60">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Câmera
            </h3>
            <Row label="Câmera + gravação">
              <Toggle checked={settings.cameraOn} onChange={(cameraOn) => updateSettings({ cameraOn })} />
            </Row>
            <Row label="Continuar gravando quando o texto terminar">
              <Toggle
                checked={settings.openMic}
                onChange={(openMic) => updateSettings({ openMic })}
              />
            </Row>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Ligado: a câmera e o microfone continuam gravando até você tocar em “Parar”.
              Desligado: a gravação termina automaticamente junto com o roteiro.
            </p>
            {settings.cameraOn && (
              <Row label="Posição da câmera">
                <Segmented
                  value={settings.cameraPosition}
                  options={[
                    { value: 'bottom', label: 'Baixo' },
                    { value: 'top', label: 'Topo' },
                    { value: 'side', label: 'Lado' },
                    { value: 'fullscreen', label: 'Tela cheia' },
                  ]}
                  onChange={(cameraPosition) => updateSettings({ cameraPosition })}
                />
              </Row>
            )}
            {settings.cameraPosition === 'fullscreen' && (
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                A câmera vira o vídeo em tela cheia e o texto rola por cima. O
                texto ganha uma sombra para continuar legível.
              </p>
            )}
            {settings.cameraPosition === 'side' && (
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                Câmera em um painel lateral ao lado do texto — útil com um vídeo de fundo (B-roll)
                para criar o efeito tela dividida.
              </p>
            )}
            <Row label="Guia de enquadramento">
              <Segmented
                value={settings.aspectGuide}
                options={[
                  { value: 'none', label: 'Nenhum' },
                  { value: '9:16', label: '9:16' },
                  { value: '4:5', label: '4:5 · Feed' },
                  { value: '1:1', label: '1:1' },
                  { value: '16:9', label: '16:9' },
                ]}
                onChange={(aspectGuide) => updateSettings({ aspectGuide })}
              />
            </Row>
            {settings.cameraOn && (
              <>
                <fieldset disabled={isRecording || filterUnavailable} className="min-w-0 disabled:opacity-60">
                <Row label="Filtro de beleza">
                  <Segmented
                    value={filterUnavailable ? 'none' : settings.beauty}
                    options={BEAUTY_OPTIONS}
                    onChange={(beauty) => updateSettings({ beauty })}
                  />
                </Row>
                {!filterUnavailable && settings.beauty !== 'none' && (
                  <>
                    <Row label={`Intensidade: ${settings.beautyIntensity}%`}>
                      <TouchSlider label="intensidade do filtro" min={0} max={100} step={5} value={settings.beautyIntensity} onChange={value => updateSettings({ beautyIntensity: value })} />
                    </Row>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                      Suaviza a pele, equilibra a luz e realça os detalhes do rosto. O filtro fica
                      gravado no vídeo final, não só na prévia.
                    </p>
                  </>
                )}
                </fieldset>
                {filterUnavailable && <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Os filtros não estão disponíveis para gravação neste aparelho. Câmera e áudio funcionam sem filtro.</p>}
                {isRecording ? <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Finalize a gravação para mudar o filtro de beleza.</p> : null}
                <Row label="Ponto de contato visual">
                  <Toggle
                    checked={settings.eyeContactDot}
                    onChange={(eyeContactDot) => updateSettings({ eyeContactDot })}
                  />
                </Row>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Mostra um pequeno ponto perto da lente para ajudar você a manter o olhar na câmera.
                  É apenas um guia na tela e não aparece no vídeo gravado.
                </p>
              </>
            )}
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              A guia de enquadramento mostra a área visível em cada formato de publicação.
            </p>
            </fieldset>
          </section>
          <section id="settings-reading" role="tabpanel" aria-labelledby="settings-tab-reading" hidden={category !== 'reading'} tabIndex={0}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Rolagem
            </h3>
            <p className="settings-help">Escolha como o texto acompanha sua apresentação.</p>
            {settings.mode === 'voice' && cameraUsesAutomaticScroll && <p className="settings-notice">No iPhone, com a câmera ligada, o texto usa a velocidade automática. Ajuste abaixo.</p>}
            <Row label="Como o texto avança">
              <Segmented
                value={settings.mode}
                options={[
                  { value: 'voice', label: 'Voz' },
                  { value: 'fixed', label: 'Automática' },
                  { value: 'timed', label: 'Por tempo' },
                  { value: 'manual', label: 'Manual' },
                ]}
                onChange={(mode) => updateSettings({ mode })}
              />
            </Row>
            {(settings.mode === 'fixed' || (settings.mode === 'voice' && cameraUsesAutomaticScroll)) && (
              <Row label={`Velocidade: ${settings.wpm} palavras/min`}>
                <TouchSlider label="velocidade" min={60} max={300} step={1} value={settings.wpm} onChange={value => updateSettings({ wpm: value })} />
              </Row>
            )}
            {settings.mode === 'timed' && (
              <>
                <Row label={`Terminar em: ${settings.targetMinutes} min`}>
                  <TouchSlider label="tempo de leitura" min={1} max={15} step={0.5} value={settings.targetMinutes} onChange={value => updateSettings({ targetMinutes: value })} />
                </Row>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Velocidade calculada: ≈{' '}
                  {Math.max(1, Math.round(wordCount / Math.max(0.1, settings.targetMinutes)))} wpm
                  ({wordCount} palavras).
                </p>
              </>
            )}
            {settings.mode === 'voice' && !cameraUsesAutomaticScroll && (
              <>
                <Row label={`Sensibilidade: ${Math.round(settings.voiceSensitivity * 100)}%`}>
                  <TouchSlider label="sensibilidade da voz" min={0.4} max={0.9} step={0.05} value={settings.voiceSensitivity} onChange={value => updateSettings({ voiceSensitivity: value })} />
                </Row>
                <Row label="Idioma da voz">
                  <select
                    value={settings.voiceLang}
                    onChange={(e) => updateSettings({ voiceLang: e.target.value })}
                    className="rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {VOICE_LANGS.map((l) => (
                      <option key={l.code} value={l.code} style={{ background: 'var(--panel)' }}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Row>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Ao tocar em “Iniciar”, o app solicita acesso ao microfone. Quando o reconhecimento
                  de palavras não está disponível no Android, usa o som da sua voz: rola enquanto
                  você fala e pausa no silêncio. Sensibilidade menor tolera mais variações.
                </p>
              </>
            )}
          </section>

          <section id="settings-text" role="tabpanel" aria-labelledby="settings-tab-text" hidden={category !== 'text'} tabIndex={0}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-2)' }}>
              Texto
            </h3>
            <Row label={`Tamanho das letras: ${settings.fontSize}px`}>
              <TouchSlider label="tamanho das letras" min={24} max={120} step={2} value={settings.fontSize} onChange={value => updateSettings({ fontSize: value })} />
            </Row>
            <Row label={`Espaço entre linhas: ${settings.lineHeight.toFixed(2)}`}>
              <TouchSlider label="espaço entre linhas" min={1.2} max={2.4} step={0.05} value={settings.lineHeight} onChange={value => updateSettings({ lineHeight: value })} />
            </Row>
            <Row label={`Espaço entre letras: ${settings.letterSpacing}px`}>
              <TouchSlider label="espaço entre letras" min={0} max={8} step={0.5} value={settings.letterSpacing} onChange={value => updateSettings({ letterSpacing: value })} />
            </Row>
            <Row label="Cor do texto">
              <input
                type="color"
                value={settings.fontColor}
                onChange={(e) => updateSettings({ fontColor: e.target.value })}
                className="h-11 w-16 cursor-pointer rounded border-0 bg-transparent"
              />
            </Row>
            <Row label="Fonte">
              <select
                value={settings.fontFamily}
                onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                className="rounded-lg border bg-transparent px-2 py-1.5 text-sm text-white"
                style={{ borderColor: 'var(--border)' }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value} style={{ background: 'var(--panel)' }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Destacar palavra atual">
              <Toggle
                checked={settings.highlightWords}
                onChange={(highlightWords) => updateSettings({ highlightWords })}
              />
            </Row>
            <Row label="Espelhar texto (vidro de teleprompter)">
              <Toggle checked={settings.mirror} onChange={(mirror) => updateSettings({ mirror })} />
            </Row>
            <Row label="Texto da direita p/ esquerda (RTL)">
              <Toggle checked={settings.rtl} onChange={(rtl) => updateSettings({ rtl })} />
            </Row>
          </section>

          <section id="settings-background" role="tabpanel" aria-labelledby="settings-tab-background" hidden={category !== 'background'} tabIndex={0}>
            <h3 className="mb-2 font-semibold">Fundo da leitura</h3>
            <p className="settings-help">Personalize o fundo atrás do texto. Essas imagens não entram na gravação da câmera.</p>
            <Row label="Cor de fundo">
              <input
                type="color"
                value={settings.bgColor}
                onChange={(e) => updateSettings({ bgColor: e.target.value })}
                className="h-11 w-16 cursor-pointer rounded border-0 bg-transparent"
              />
            </Row>
            <div className="settings-row flex flex-col items-stretch gap-3 py-4">
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                Imagem de fundo
              </span>
              <div className="flex items-center justify-end gap-2">
                <input
                  ref={bgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) pickBgImage(f)
                    e.target.value = ''
                  }}
                />
                {settings.bgImage ? (
                  <>
                    <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: `url(${settings.bgImage}) center/cover no-repeat` }} aria-hidden="true" />
                    <button
                      onClick={() => updateSettings({ bgImage: null })}
                      className="rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    >
                      Remover
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Escolher imagem
                  </button>
                )}
              </div>
            </div>
            {settings.bgImage && (
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                A imagem fica atrás do texto do prompter, com uma leve sombra para legibilidade.
              </p>
            )}
            <div className="flex flex-col gap-2 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  Vídeo de fundo (B-roll)
                </span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input
                    ref={brollFileRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) pickBrollFile(f)
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => brollFileRef.current?.click()}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    Escolher vídeo
                  </button>
                  <button
                    onClick={() => setShowBrollUrl((v) => !v)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    URL
                  </button>
                  {settings.bgVideo && (
                    <button
                      onClick={() => updateSettings({ bgVideo: null })}
                      className="rounded-lg border px-2.5 py-1.5 text-xs"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
              {settings.bgVideo && (
                <video
                  src={settings.bgVideo}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="h-24 w-full rounded-lg object-cover"
                />
              )}
              {showBrollUrl && (
                <div className="flex gap-2">
                  <input
                    value={brollUrl}
                    onChange={(e) => setBrollUrl(e.target.value)}
                    placeholder="Cole a URL de um vídeo (.mp4)..."
                    className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-xs outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => {
                      const u = brollUrl.trim()
                      if (u) {
                        updateSettings({ bgVideo: u })
                        setBrollUrl('')
                        setShowBrollUrl(false)
                      }
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                    style={{ background: 'var(--accent)', color: 'black' }}
                  >
                    Usar
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={brollQuery}
                  onChange={(e) => setBrollQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runBrollSearch()
                  }}
                  placeholder="Buscar B-roll (ex.: cidade, café, escritório)..."
                  className="min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-xs outline-none disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => void runBrollSearch()}
                  disabled={brollBusy || !brollQuery.trim()}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'black' }}
                >
                  {brollBusy ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              {brollError && (
                <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
                  {brollError}
                </p>
              )}
              {brollResults.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {brollResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => updateSettings({ bgVideo: c.url })}
                      className="group relative aspect-video overflow-hidden rounded-lg border"
                      style={{ borderColor: settings.bgVideo === c.url ? 'var(--accent)' : 'var(--border)' }}
                      title={`Clique para usar (${Math.round(c.duration)}s)`}
                    >
                      <img src={c.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">
                        {Math.round(c.duration)}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                O vídeo fica atrás do texto, em loop e sem som. Entre na sua conta para buscar clipes do Pexels.
              </p>
            </div>
          </section>

          <button
            disabled={isRecording}
            onClick={() => { if (window.confirm('Restaurar todos os ajustes de gravação?')) resetSettings() }}
            className="mt-5 min-h-11 w-full rounded-xl border px-3 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Restaurar padrões
          </button>
        </div>
      </div>
    </div>
  )
}
