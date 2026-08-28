import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import {
  TalkingAvatar,
  VoiceRecorder,
  createAvatar,
  createVoiceProfile,
  dataUrlToBlob,
  fileToAvatarDataUrl,
  listAvatars,
  listVoiceProfiles,
  loadImage,
  removeAvatar,
  removeVoiceProfile,
} from '../../lib/aiTwin'
import { generateAvatar, speakWithTts } from '../../lib/cloudflare'
import type { AvatarTwin, VoiceProfile, VoiceSample } from '../../lib/types'

type Aspect = '9:16' | '1:1' | '16:9'

const ASPECTS: Record<Aspect, { w: number; h: number }> = {
  // 540p mantém boa definição e reduz a carga da GPU durante animação/gravação.
  '9:16': { w: 540, h: 960 },
  '1:1': { w: 540, h: 540 },
  '16:9': { w: 960, h: 540 },
}

export default function AiTwin() {
  const recording = useAppStore((s) => s.recording)
  const [avatars, setAvatars] = useState<AvatarTwin[]>([])
  const [voices, setVoices] = useState<VoiceProfile[]>([])
  const [avatarId, setAvatarId] = useState<number | null>(null)
  const [voiceId, setVoiceId] = useState<number | null>(null)
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [motion, setMotion] = useState<'breathing' | 'subtle' | 'none'>('breathing')
  const [text, setText] = useState('')
  const [source, setSource] = useState<'tts' | 'recording' | 'sample'>('tts')
  const [sampleId, setSampleId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [progress, setProgress] = useState(0)
  const [outUrl, setOutUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [player, setPlayer] = useState<{ state: 'idle' | 'playing' | 'paused' | 'done'; at: number }>({ state: 'idle', at: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [fluxPrompt, setFluxPrompt] = useState('')
  const [recorder, setRecorder] = useState<VoiceRecorder | null>(null)
  const [recSeconds, setRecSeconds] = useState(0)
  const [pendingSamples, setPendingSamples] = useState<VoiceSample[]>([])
  const [voiceName, setVoiceName] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<AvatarTwin | null>(null)
  const deviceSpeechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const canvasGenerationRef = useRef(0)

  const avatar = avatars.find((a) => a.id === avatarId) ?? null
  const voice = voices.find((v) => v.id === voiceId) ?? null
  const talk = useRef<TalkingAvatar | null>(null)
  const loadedBlobRef = useRef<Blob | null>(null)

  const refresh = async () => {
    setAvatars(await listAvatars())
    setVoices(await listVoiceProfiles())
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel()
      deviceSpeechRef.current = null
      talk.current?.destroy()
      talk.current = null
    }
  }, [])

  useEffect(() => () => recorder?.cancel(), [recorder])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return
      window.speechSynthesis?.cancel()
      deviceSpeechRef.current = null
      talk.current?.pause()
      setPlayer((current) => ({ ...current, state: 'paused' }))
      if (isRecording) {
        void talk.current?.stopRecording().finally(() => setIsRecording(false))
      }
      if (recorder) {
        recorder.cancel()
        setRecorder(null)
        setRecSeconds(0)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isRecording, recorder])

  useEffect(() => {
    return () => {
      if (outUrl) URL.revokeObjectURL(outUrl)
    }
  }, [outUrl])

  useEffect(() => {
    const generation = ++canvasGenerationRef.current
    talk.current?.destroy()
    talk.current = null
    if (!avatar) return
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = ASPECTS[aspect]
    void (async () => {
      try {
        const img = await loadImage(avatar.imageDataUrl)
        if (canvasGenerationRef.current !== generation || canvasRef.current !== canvas) return
        talk.current = new TalkingAvatar(canvas, {
          image: img,
          width: w,
          height: h,
          zoom: 1.15,
          focusY: 0.3,
          motion,
          onProgress: (cur, dur) => {
            setProgress(dur ? cur / dur : 0)
            setPlayer((current) => ({ ...current, at: cur }))
          },
          onEnded: () => setPlayer((current) => ({ ...current, state: 'done' })),
        })
      } catch (error) {
        if (canvasGenerationRef.current === generation) {
          setMsg({ type: 'err', text: (error as Error).message })
        }
      }
    })()
  }, [avatar, aspect, motion])

  useEffect(() => {
    loadedBlobRef.current = null
    window.speechSynthesis?.cancel()
    deviceSpeechRef.current = null
    talk.current?.stop()
    setPlayer({ state: 'idle', at: 0 })
    setProgress(0)
  }, [source, text, voiceId, sampleId, recording])

  const speakOnDevice = useCallback(() => {
    if (!('speechSynthesis' in window) || !text.trim()) {
      throw new Error('Este aparelho não oferece uma voz em português para a prévia.')
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.trim())
    const availableVoices = window.speechSynthesis.getVoices()
    const portugueseVoice = availableVoices.find((item) => item.lang.toLowerCase() === 'pt-br')
      ?? availableVoices.find((item) => item.lang.toLowerCase().startsWith('pt'))
    utterance.lang = portugueseVoice?.lang ?? 'pt-BR'
    if (portugueseVoice) utterance.voice = portugueseVoice
    utterance.rate = 1
    utterance.onend = () => {
      talk.current?.stopVisualSpeech()
      deviceSpeechRef.current = null
      setPlayer({ state: 'idle', at: 0 })
    }
    utterance.onerror = () => {
      talk.current?.stopVisualSpeech()
      deviceSpeechRef.current = null
      setPlayer({ state: 'idle', at: 0 })
      setMsg({ type: 'err', text: 'A voz em português do aparelho não conseguiu reproduzir este texto.' })
    }
    deviceSpeechRef.current = utterance
    talk.current?.startVisualSpeech()
    setPlayer({ state: 'playing', at: 0 })
    setMsg({ type: 'ok', text: 'Prévia em português usando a voz instalada no seu aparelho.' })
    window.speechSynthesis.speak(utterance)
  }, [text])

  const savePhotoAvatar = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      const name = file.name.replace(/\.[^.]+$/, '') || 'Meu rosto'
      const id = await createAvatar(name, dataUrl, 'photo')
      setAvatarId(id)
      await refresh()
      setMsg({ type: 'ok', text: 'Avatar criado a partir da foto!' })
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const generateFlux = async () => {
    if (!fluxPrompt.trim()) {
      setMsg({ type: 'err', text: 'Descreva o avatar que deseja gerar.' })
      return
    }
    setBusy(true)
    setMsg(null)
    let url: string | null = null
    try {
      const blob = await generateAvatar(fluxPrompt.trim())
      url = URL.createObjectURL(blob)
      const canvas = document.createElement('canvas')
      const img = await loadImage(url)
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      const id = await createAvatar(`Avatar IA: ${fluxPrompt.slice(0, 20)}`, dataUrl, 'flux')
      setAvatarId(id)
      await refresh()
      setMsg({ type: 'ok', text: 'Avatar gerado com IA!' })
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      if (url) URL.revokeObjectURL(url)
      setBusy(false)
    }
  }

  const startVoiceRec = async () => {
    try {
      const r = new VoiceRecorder()
      r.onTick = (s) => setRecSeconds(s)
      await r.start()
      setRecorder(r)
      setMsg(null)
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    }
  }

  const stopVoiceRec = async () => {
    if (!recorder) return
    try {
      const sample = await recorder.stop()
      setPendingSamples((prev) => [...prev, sample])
      setVoiceName((current) => current || `Minha voz ${voices.length + 1}`)
      setRecorder(null)
      setRecSeconds(0)
      setMsg({ type: 'ok', text: 'Amostra gravada. Confira o áudio, ajuste o nome e toque em “Salvar perfil”.' })
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
      setRecorder(null)
      setRecSeconds(0)
    }
  }

  const saveVoice = async () => {
    if (!pendingSamples.length) {
      setMsg({ type: 'err', text: 'Grave pelo menos uma amostra de voz.' })
      return
    }
    if (!voiceName.trim()) {
      setMsg({ type: 'err', text: 'Dê um nome ao perfil de voz.' })
      return
    }
    setBusy(true)
    try {
      const id = await createVoiceProfile(voiceName.trim(), pendingSamples, 'pt-BR')
      setVoiceId(id)
      setSource('sample')
      setSampleId(0)
      setPendingSamples([])
      setVoiceName('')
      await refresh()
      setMsg({
        type: 'ok',
        text: `Perfil “${voiceName.trim()}” salvo e selecionado. Ele reproduz sua gravação; não clona a voz para textos novos.`,
      })
    } catch (err) {
      setMsg({ type: 'err', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const resolveAudio = async (): Promise<Blob | null> => {
    if (source === 'tts') {
      if (!text.trim()) {
        setMsg({ type: 'err', text: 'Digite o texto que o avatar deve falar.' })
        return null
      }
      setBusy(true)
      setMsg(null)
      try {
        return await speakWithTts(text.trim(), 'pt')
      } finally {
        setBusy(false)
      }
    }
    if (source === 'recording') {
      if (!recording) {
        setMsg({ type: 'err', text: 'Nenhuma gravação do prompter disponível. Grave um take primeiro.' })
        return null
      }
      return recording.blob
    }
    const sample = voice?.samples.find((_, i) => i === sampleId)
    if (!sample) {
      setMsg({ type: 'err', text: 'Selecione uma amostra de voz.' })
      return null
    }
    return dataUrlToBlob(sample.dataUrl)
  }

  const play = async () => {
    const t = talk.current
    if (!t) return
    try {
      const blob = await resolveAudio()
      if (!blob) return
      loadedBlobRef.current = blob
      await t.loadAudio(blob)
      setOutUrl(null)
      setProgress(0)
      await t.start()
      setPlayer({ state: 'playing', at: 0 })
    } catch (err) {
      setBusy(false)
      if (source === 'tts') {
        try {
          speakOnDevice()
          return
        } catch (deviceError) {
          setMsg({ type: 'err', text: (deviceError as Error).message })
          return
        }
      }
      setMsg({ type: 'err', text: (err as Error).message })
    }
  }

  const pause = () => {
    if (deviceSpeechRef.current) {
      window.speechSynthesis.cancel()
      deviceSpeechRef.current = null
    }
    talk.current?.pause()
    setPlayer((p) => ({ ...p, state: 'paused' }))
  }

  const stopPlay = () => {
    window.speechSynthesis?.cancel()
    deviceSpeechRef.current = null
    talk.current?.stop()
    setPlayer({ state: 'idle', at: 0 })
    setProgress(0)
  }

  const toggleRecording = async () => {
    const t = talk.current
    if (!t) return
    if (isRecording) {
      const blob = await t.stopRecording()
      t.stop()
      setIsRecording(false)
      setPlayer({ state: 'idle', at: 0 })
      if (blob) {
        const url = URL.createObjectURL(blob)
        setOutUrl(url)
        setMsg({ type: 'ok', text: 'Vídeo do avatar gerado! Baixe abaixo.' })
      }
      return
    }
    try {
      let blob = loadedBlobRef.current
      if (!blob) {
        blob = await resolveAudio()
        if (!blob) return
        loadedBlobRef.current = blob
      }
      t.stop()
      await t.loadAudio(blob)
      await t.startRecording()
      await t.start()
      setIsRecording(true)
      setPlayer({ state: 'playing', at: 0 })
      setProgress(0)
      setOutUrl(null)
      setMsg({ type: 'ok', text: 'Gravando… toque em "⏹ Parar" para finalizar.' })
    } catch (err) {
      setIsRecording(false)
      setMsg({
        type: 'err',
        text: source === 'tts'
          ? 'A prévia em português funciona com a voz do aparelho. Para exportar vídeo com áudio, escolha uma gravação do prompter ou uma amostra da sua voz.'
          : (err as Error).message,
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8" lang="pt-BR">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Avatar IA</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Combine um rosto, um áudio e um movimento para criar um vídeo de avatar. A foto é animada
          localmente; a amostra de voz é reproduzida, não clonada.
        </p>
      </div>

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.type === 'err' ? 'var(--danger)' : 'var(--ok)' }}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna de configuração */}
        <div className="space-y-4">
          {/* Avatar */}
          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <h2 className="mb-3 text-sm font-semibold text-white">1. Rosto do avatar</h2>
            <div className="flex flex-wrap gap-2">
              {avatars.map((a) => (
                <button
                  key={a.id ?? a.key}
                  onClick={() => {
                    setAvatarId(a.id ?? null)
                    setAvatarPreview(a)
                  }}
                  className="group relative overflow-hidden rounded-xl border"
                  style={{
                    borderColor: a.id === avatarId ? 'var(--accent)' : 'var(--border)',
                  }}
                  title={a.name}
                >
                  <img src={a.imageDataUrl} alt={a.name} className="h-16 w-16 object-cover" />
                  <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/70 to-transparent pb-1">
                    <span className="text-[10px] font-semibold text-white">Ampliar</span>
                  </span>
                </button>
              ))}
              <div className="flex flex-col items-center justify-center gap-1">
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void savePhotoAvatar(f)
                  }}
                />
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={busy}
                  className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  📷 Foto
                </button>
              </div>
            </div>
            {avatar && (
              <div className="mt-2 flex items-center justify-between">
                <span className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {avatar.name} · {avatar.source === 'flux' ? 'IA' : 'foto'}
                </span>
                <button
                  onClick={async () => {
                    if (avatar.id != null) await removeAvatar(avatar.id)
                    await refresh()
                  }}
                  className="text-xs"
                  style={{ color: 'var(--danger)' }}
                >
                  apagar
                </button>
              </div>
            )}
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>
                Gerar rosto com IA (Flux)
              </label>
              <div className="flex gap-2">
                <input
                  value={fluxPrompt}
                  onChange={(e) => setFluxPrompt(e.target.value)}
                  lang="pt-BR"
                  spellCheck
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void generateFlux()
                  }}
                  placeholder="Ex.: homem de 30 anos, terno, fundo de estúdio"
                  className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => void generateFlux()}
                  disabled={busy}
                  className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  ✨ Gerar
                </button>
              </div>
            </div>
          </section>

          {/* Voz */}
          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <h2 className="mb-3 text-sm font-semibold text-white">2. Voz do avatar</h2>
            <div className="flex flex-wrap gap-2">
              {voices.map((v) => (
                <button
                  key={v.id ?? v.key}
                  onClick={() => {
                    setVoiceId(v.id ?? null)
                    setSource('sample')
                    setSampleId(0)
                  }}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: v.id === voiceId ? 'var(--accent)' : 'var(--border)',
                    color: v.id === voiceId ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  🎙️ {v.name}
                </button>
              ))}
            </div>
            {voice && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {voice.samples.length} amostra(s) · {voice.lang}
                </span>
                <button
                  onClick={async () => {
                    if (voice.id != null) await removeVoiceProfile(voice.id)
                    await refresh()
                  }}
                  className="text-xs"
                  style={{ color: 'var(--danger)' }}
                >
                  apagar
                </button>
              </div>
            )}

            <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Grave um trecho para o avatar reproduzir com sua voz real. Esta função usa o áudio
                gravado exatamente como está; ela não transforma textos novos na sua voz.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {!recorder ? (
                  <button
                    onClick={() => void startVoiceRec()}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    🔴 Gravar amostra
                  </button>
                ) : (
                  <button
                    onClick={() => void stopVoiceRec()}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}
                  >
                    ⏹ Parar ({recSeconds.toFixed(1)}s)
                  </button>
                )}
                {recorder && (
                  <button
                    onClick={() => {
                      recorder.cancel()
                      setRecorder(null)
                      setRecSeconds(0)
                    }}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
              {pendingSamples.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <audio controls src={pendingSamples[pendingSamples.length - 1]!.dataUrl} className="h-8 w-40" />
                  <span className="text-xs" style={{ color: 'var(--ok)' }}>
                    {pendingSamples.length} amostra(s) pronta(s)
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  lang="pt-BR"
                  spellCheck
                  autoCorrect="on"
                  placeholder="Nome exibido, ex.: Minha voz principal"
                  className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <button
                  onClick={() => void saveVoice()}
                  disabled={busy || !pendingSamples.length || !voiceName.trim()}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  Salvar perfil
                </button>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                O nome é obrigatório porque identifica o perfil nos próximos passos.
              </p>
            </div>
          </section>

          {/* Fala */}
          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <h2 className="mb-3 text-sm font-semibold text-white">3. O que o avatar fala</h2>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  ['tts', 'Texto → voz IA'],
                  ['recording', 'Gravação do prompter'],
                  ['sample', 'Amostra da minha voz'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSource(id)}
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: source === id ? 'var(--accent)' : 'var(--border)',
                    color: source === id ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {source === 'tts' && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                lang="pt-BR"
                spellCheck
                autoCorrect="on"
                autoCapitalize="sentences"
                rows={4}
                placeholder="Texto que o avatar deve falar em português"
                className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            )}
            {source === 'recording' && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {recording
                  ? '✓ Há uma gravação do prompter pronta. O avatar vai falar com a sua voz real.'
                  : 'Nenhuma gravação disponível. Grave um take no prompter para usar como áudio do avatar.'}
              </p>
            )}
            {source === 'sample' && voice && (
              <div className="flex flex-wrap gap-2">
                {voice.samples.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSampleId(i)}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: sampleId === i ? 'var(--accent)' : 'var(--border)',
                      color: sampleId === i ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {voice.name} · trecho {i + 1} ({s.duration.toFixed(1)}s)
                  </button>
                ))}
              </div>
            )}
            {source === 'sample' && !voice && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Crie um perfil de voz primeiro (seção 2).
              </p>
            )}
          </section>
        </div>

        {/* Coluna de preview */}
        <div className="space-y-4">
          <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">4. Avatar falante</h2>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className="rounded border px-2 py-1 text-[11px]"
                    style={{
                      background: aspect === a ? 'var(--bg)' : 'transparent',
                      color: aspect === a ? 'var(--accent)' : 'var(--muted)',
                      borderColor: aspect === a ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {a}
                  </button>
                ))}
                <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Movimento
                  <select
                    value={motion}
                    onChange={(e) => setMotion(e.target.value as typeof motion)}
                    className="rounded border bg-transparent px-2 py-1 text-[11px] outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    <option value="breathing">Respiração</option>
                    <option value="subtle">Movimento leve</option>
                    <option value="none">Corpo parado</option>
                  </select>
                </label>
              </div>
            </div>

            <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              “Respiração” movimenta mais o corpo; “Movimento leve” reduz o balanço; “Corpo parado”
              mantém apenas a animação da boca durante o áudio.
            </p>

            <div className="flex justify-center rounded-lg" style={{ background: '#000' }}>
              <canvas
                ref={canvasRef}
                className="max-h-[520px] w-auto rounded-lg"
                style={{ maxWidth: '100%', aspectRatio: `${ASPECTS[aspect].w}/${ASPECTS[aspect].h}` }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isRecording &&
                (player.state === 'playing' ? (
                  <button
                    onClick={pause}
                    className="rounded-lg border px-4 py-2 text-sm"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    ⏸ Pausar
                  </button>
                ) : (
                  <button
                    onClick={() => void play()}
                    disabled={busy || !avatar}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    {busy ? 'Carregando…' : '▶ Falar'}
                  </button>
                ))}
              <button
                onClick={() => void toggleRecording()}
                disabled={!avatar || busy}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
                style={{
                  borderColor: isRecording ? 'var(--ok)' : 'var(--danger)',
                  color: isRecording ? 'var(--ok)' : 'var(--danger)',
                  background: isRecording ? 'var(--ok)1a' : 'transparent',
                }}
              >
                {isRecording ? '⏹ Parar' : '⏺ Gerar vídeo'}
              </button>
              {!isRecording && (player.state === 'playing' || player.state === 'paused' || player.state === 'done') && (
                <button
                  onClick={stopPlay}
                  className="rounded-lg border px-4 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                >
                  ■ Parar
                </button>
              )}
              <div className="ml-auto h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg)', maxWidth: 160 }}>
                <div className="h-full rounded-full transition-all" style={{ background: 'var(--accent)', width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>

            {outUrl && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--ok)' }}>
                <p className="mb-2 text-xs" style={{ color: 'var(--ok)' }}>
                  ✓ Vídeo gerado
                </p>
                <video src={outUrl} controls className="max-h-64 w-full rounded-lg" />
                <a
                  href={outUrl}
                  download={`alvoprompter-twin-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`}
                  className="mt-2 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-black"
                  style={{ background: 'var(--accent)' }}
                >
                  ⬇️ Baixar vídeo
                </a>
              </div>
            )}

            {!avatar && (
              <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                Adicione um rosto (seção 1) para começar.
              </p>
            )}
          </section>
        </div>
      </div>

      {avatarPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label={`Prévia ampliada de ${avatarPreview.name}`}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-semibold text-white">{avatarPreview.name}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Prévia do rosto selecionado</p>
              </div>
              <button onClick={() => setAvatarPreview(null)} className="min-h-10 rounded-xl border px-3 text-sm font-semibold text-white" style={{ borderColor: 'rgba(255,255,255,.28)', background: 'rgba(255,255,255,.08)' }}>
                Fechar
              </button>
            </div>
            <img src={avatarPreview.imageDataUrl} alt={avatarPreview.name} className="max-h-[72dvh] w-full object-contain" style={{ background: '#050608' }} />
          </div>
        </div>
      )}
    </div>
  )
}
