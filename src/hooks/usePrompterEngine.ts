import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineState, ScrollMode } from '../lib/types'

interface EngineOptions {
  mode: ScrollMode
  wordCount: number
  wpm: number
  onFrame: (fraction: number) => void
}

export function usePrompterEngine({ mode, wordCount, wpm, onFrame }: EngineOptions) {
  const [state, setState] = useState<EngineState>('idle')
  const stateRef = useRef<EngineState>('idle')
  const fractionRef = useRef(0)
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const lastPaintTsRef = useRef(0)
  const optsRef = useRef({ mode, wordCount, wpm, onFrame })
  optsRef.current = { mode, wordCount, wpm, onFrame }

  const setEngineState = useCallback((next: EngineState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const tick = useCallback(
    (ts: number) => {
      if (stateRef.current !== 'running') return
      const { wordCount, wpm, onFrame } = optsRef.current
      if (lastTsRef.current === 0) lastTsRef.current = ts
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.25)
      lastTsRef.current = ts
      if (wordCount > 1) {
        const perSecond = wpm / (wordCount * 60)
        fractionRef.current = Math.min(1, fractionRef.current + perSecond * dt)
        if (ts - lastPaintTsRef.current >= 1000 / 30 || fractionRef.current >= 1) {
          lastPaintTsRef.current = ts
          onFrame(fractionRef.current)
        }
        if (fractionRef.current >= 1) {
          setEngineState('done')
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [setEngineState],
  )

  const startFixed = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    lastTsRef.current = 0
    lastPaintTsRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const start = useCallback((modeOverride?: ScrollMode) => {
    const { wordCount, mode, onFrame } = optsRef.current
    const resolvedMode = modeOverride ?? mode
    if (wordCount === 0) return
    // Permite ativar a rolagem automática como fallback mesmo quando o
    // reconhecimento de voz falha depois que o motor já foi iniciado.
    if (stateRef.current === 'running') {
      if (resolvedMode === 'fixed' || resolvedMode === 'timed') startFixed()
      return
    }
    if (stateRef.current === 'idle' || stateRef.current === 'done') {
      fractionRef.current = 0
      onFrame(0)
    }
    setEngineState('running')
    if (resolvedMode === 'fixed' || resolvedMode === 'timed') startFixed()
  }, [setEngineState, startFixed])

  const pause = useCallback(() => {
    if (stateRef.current !== 'running') return
    cancelAnimationFrame(rafRef.current)
    setEngineState('paused')
  }, [setEngineState])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    fractionRef.current = 0
    optsRef.current.onFrame(0)
    setEngineState('idle')
  }, [setEngineState])

  const seekToFraction = useCallback((f: number) => {
    const clamped = Math.max(0, Math.min(1, f))
    fractionRef.current = clamped
    optsRef.current.onFrame(clamped)
    if (clamped >= 1 && stateRef.current === 'running') {
      cancelAnimationFrame(rafRef.current)
      setEngineState('done')
    }
  }, [setEngineState])

  const seekToWord = useCallback(
    (index: number) => {
      const { wordCount } = optsRef.current
      if (wordCount <= 1) {
        seekToFraction(0)
        return
      }
      seekToFraction(index / (wordCount - 1))
    },
    [seekToFraction],
  )

  const nudge = useCallback(
    (deltaFraction: number) => {
      seekToFraction(fractionRef.current + deltaFraction)
    },
    [seekToFraction],
  )

  useEffect(
    () => () => cancelAnimationFrame(rafRef.current),
    [],
  )

  return {
    state,
    fraction: fractionRef,
    start,
    pause,
    stop,
    seekToFraction,
    seekToWord,
    nudge,
  }
}
