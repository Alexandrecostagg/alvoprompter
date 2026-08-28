import { useCallback, useEffect, useRef, useState } from 'react'
import { similarity, type WordToken } from '../lib/text'
import {
  getSpeechRecognitionCtor,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../lib/speech'

interface VoiceTrackOptions {
  words: WordToken[]
  enabled: boolean
  lang: string
  sensitivity: number
  onWordMatch: (index: number) => void
  onSpeechActivity: (active: boolean) => void
  onUtterance?: (text: string) => void
}

const SILENCE_MS = 1800
const LEVEL_SAMPLE_MS = 50
const SILENCE_REFRESH_MS = 250
const AHEAD_WINDOW = 8
const BEHIND_WINDOW = 3

export type VoiceTrackingMode = 'recognition' | 'audio-level' | 'none'

function initialTrackingMode(): VoiceTrackingMode {
  if (getSpeechRecognitionCtor()) return 'recognition'
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  ) return 'audio-level'
  return 'none'
}

export function useVoiceTrack({
  words,
  enabled,
  lang,
  sensitivity,
  onWordMatch,
  onSpeechActivity,
  onUtterance,
}: VoiceTrackOptions) {
  const [mode, setMode] = useState<VoiceTrackingMode>(initialTrackingMode)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const runningRef = useRef(false)
  const pointerRef = useRef(0)
  const activeRef = useRef(false)
  const silenceTimerRef = useRef<number | null>(null)
  const lastSilenceRefreshRef = useRef(0)
  const exactMapRef = useRef<Map<string, number[]>>(new Map())
  const micStreamRef = useRef<MediaStream | null>(null)
  const micContextRef = useRef<AudioContext | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const micFrameRef = useRef(0)
  const cbRef = useRef({ words, onWordMatch, onSpeechActivity, sensitivity, lang, onUtterance })
  cbRef.current = { words, onWordMatch, onSpeechActivity, sensitivity, lang, onUtterance }

  useEffect(() => {
    const map = new Map<string, number[]>()
    for (const w of words) {
      if (!w.normalized) continue
      const list = map.get(w.normalized)
      if (list) list.push(w.index)
      else map.set(w.normalized, [w.index])
    }
    exactMapRef.current = map
    pointerRef.current = 0
  }, [words])

  const markActive = useCallback(() => {
    const now = performance.now()
    if (!activeRef.current) {
      activeRef.current = true
      cbRef.current.onSpeechActivity(true)
    }
    // Evita criar/limpar cerca de 60 timers por segundo durante uma fala.
    if (
      silenceTimerRef.current != null &&
      now - lastSilenceRefreshRef.current < SILENCE_REFRESH_MS
    ) return
    lastSilenceRefreshRef.current = now
    if (silenceTimerRef.current != null) window.clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null
      activeRef.current = false
      cbRef.current.onSpeechActivity(false)
    }, SILENCE_MS)
  }, [])

  const processText = useCallback(
    (text: string) => {
      const { words, onWordMatch, sensitivity } = cbRef.current
      if (!words.length) return
      const tokens = text.split(/\s+/).filter(Boolean)
      let pointer = pointerRef.current
      for (const token of tokens) {
        let bestIdx = -1
        let bestScore = sensitivity
        const from = Math.max(0, pointer - BEHIND_WINDOW)
        const to = Math.min(words.length - 1, pointer + AHEAD_WINDOW)
        for (let i = from; i <= to; i++) {
          const score = similarity(token, words[i].normalized)
          if (score > bestScore) {
            bestScore = score
            bestIdx = i
          }
        }
        if (bestIdx < 0) {
          const candidates = exactMapRef.current.get(token.toLowerCase())
          if (candidates?.length) {
            const nearest = candidates.reduce((a, b) =>
              Math.abs(a - pointer) <= Math.abs(b - pointer) ? a : b,
            )
            if (Math.abs(nearest - pointer) > AHEAD_WINDOW) {
              bestIdx = nearest
            }
          }
        }
        if (bestIdx >= pointer) {
          pointer = bestIdx + 1
          onWordMatch(bestIdx)
        }
      }
      pointerRef.current = Math.min(pointer, words.length)
    },
    [],
  )

  const handleResult = useCallback(
    (event: SpeechRecognitionEventLike) => {
      markActive()
      const { onUtterance } = cbRef.current
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r?.isFinal) {
          const text = String(r[0]?.transcript ?? '').trim()
          if (text) onUtterance?.(text)
        }
        processText(String(event.results[i]?.[0]?.transcript ?? ''))
      }
    },
    [markActive, processText],
  )

  const releaseAudioLevel = useCallback(() => {
    cancelAnimationFrame(micFrameRef.current)
    micSourceRef.current?.disconnect()
    micSourceRef.current = null
    micAnalyserRef.current = null
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    if (micContextRef.current) void micContextRef.current.close()
    micContextRef.current = null
  }, [])

  const stop = useCallback(() => {
    runningRef.current = false
    recognitionRef.current?.abort()
    recognitionRef.current = null
    releaseAudioLevel()
    setListening(false)
    if (silenceTimerRef.current != null) window.clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
    lastSilenceRefreshRef.current = 0
    if (activeRef.current) cbRef.current.onSpeechActivity(false)
    activeRef.current = false
  }, [releaseAudioLevel])

  const startAudioLevel = useCallback(async () => {
    if (runningRef.current || !navigator.mediaDevices?.getUserMedia) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const AudioCtor = window.AudioContext
      const context = new AudioCtor()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)
      await context.resume()

      micStreamRef.current = stream
      micContextRef.current = context
      micSourceRef.current = source
      micAnalyserRef.current = analyser
      runningRef.current = true
      setListening(true)
      cbRef.current.onSpeechActivity(false)

      const data = new Uint8Array(analyser.fftSize)
      let lastSampleAt = 0
      const sampleLevel = (now: number) => {
        if (!runningRef.current || micAnalyserRef.current !== analyser) return
        if (now - lastSampleAt >= LEVEL_SAMPLE_MS) {
          lastSampleAt = now
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const value = (data[i]! - 128) / 128
            sum += value * value
          }
          const rms = Math.sqrt(sum / data.length)
          if (rms > 0.025) markActive()
        }
        micFrameRef.current = requestAnimationFrame(sampleLevel)
      }
      micFrameRef.current = requestAnimationFrame(sampleLevel)
    } catch (err) {
      releaseAudioLevel()
      runningRef.current = false
      setListening(false)
      const name = (err as DOMException).name
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Permissão de microfone negada. Autorize o microfone para usar a rolagem por voz.'
          : 'Não foi possível abrir o microfone para acompanhar sua voz.',
      )
    }
  }, [markActive, releaseAudioLevel])

  const start = useCallback(() => {
    if (mode === 'audio-level') {
      void startAudioLevel()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor || runningRef.current) return
    setError(null)
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = cbRef.current.lang
    rec.onresult = handleResult
    rec.onend = () => {
      if (!runningRef.current) return
      window.setTimeout(() => {
        if (runningRef.current) {
          try {
            rec.start()
          } catch {
            /* already started */
          }
        }
      }, 150)
    }
    rec.onerror = (event) => {
      if (event.error === 'service-not-allowed' || event.error === 'language-not-supported') {
        runningRef.current = false
        recognitionRef.current = null
        setListening(false)
        setMode('audio-level')
        void startAudioLevel()
        return
      }
      if (event.error === 'not-allowed') {
        runningRef.current = false
        setListening(false)
        setError('Permissão de microfone negada. Habilite o microfone para usar a rolagem por voz.')
        return
      }
      if (event.error === 'no-speech') return
    }
    recognitionRef.current = rec
    try {
      rec.start()
      runningRef.current = true
      setListening(true)
    } catch {
      setError('Não foi possível iniciar o reconhecimento de voz neste navegador.')
    }
  }, [handleResult, mode, startAudioLevel])

  const reset = useCallback(() => {
    pointerRef.current = 0
  }, [])

  useEffect(() => {
    if (!enabled) stop()
  }, [enabled, stop])

  useEffect(() => () => stop(), [stop])

  return { supported: mode !== 'none', mode, listening, error, start, stop, reset }
}
