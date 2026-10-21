import { useCallback, useEffect, useRef, useState } from 'react'
import { newKey } from '../lib/db'
import { saveRehearsalAudio, type RehearsalAudio } from '../lib/rehearsals'
import { startAudioRecordingSession, type RecordingSession } from '../lib/recordingSession'
import { setRecordingAudioMode, prepareRecordedPlayback } from '../lib/recordingAudio'
import { mediaScope } from '../lib/videoProjects'
import { useAppStore } from '../store/useAppStore'
import type { PrompterSettings, Script } from '../lib/types'

type Take = { session: RecordingSession; stream: MediaStream; meta: RehearsalAudio; startedAt: number; blob?: Blob; saved?: boolean; finishing?: Promise<void> }
export function useRehearsalAudio(script: Script | null, settings: PrompterSettings, fraction: () => number) {
  const owner = useAppStore(s => s.mediaOwner)
  const workspace = useAppStore(s => s.cloudWorkspace?.id ?? null)
  const scope = mediaScope(owner, workspace)
  const latest = useRef({ script, settings, scope, fraction })
  latest.current = { script, settings, scope, fraction }
  const mounted = useRef(true)
  const take = useRef<Take | null>(null)
  const requesting = useRef(false)
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const finish = useCallback(async () => {
    const current = take.current
    if (!current || current.saved) return
    if (current.finishing) return current.finishing
    const fractionAtStop = latest.current.fraction()
    current.finishing = (async () => {
      if (mounted.current) setStatus('saving')
      try {
        if (!current.blob) {
          current.meta.fraction = fractionAtStop
          current.meta.duration = Math.max(.001, (performance.now() - current.startedAt) / 1000)
        }
        current.session.stop()
        try { current.blob ??= await current.session.result }
        finally { current.stream.getTracks().forEach(track => track.stop()); prepareRecordedPlayback() }
        const store = useAppStore.getState()
        if (mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== current.meta.scope) throw new Error('A conta mudou. Volte à conta do ensaio antes de tentar salvar.')
        await saveRehearsalAudio(current.meta, current.blob)
        current.saved = true
        if (mounted.current) { setStatus('idle'); setMessage('Áudio salvo neste aparelho. Ouça em Roteiros → Seus ensaios.') }
      } catch (error) {
        if (mounted.current) { setStatus(current.blob ? 'error' : 'idle'); setMessage(current.blob ? 'O áudio ainda não foi salvo. Libere espaço e toque em Tentar salvar áudio.' : error instanceof Error ? error.message : 'Não foi possível gravar o áudio.') }
        if (!current.blob) take.current = null
        throw error
      } finally { current.finishing = undefined }
    })()
    return current.finishing
  }, [])
  const start = useCallback(async () => {
    if (requesting.current || (take.current && !take.current.saved)) return false
    const snapshot = latest.current
    if (!snapshot.script?.key || !snapshot.script.content.trim()) return false
    requesting.current = true
    setStatus('requesting'); setMessage(null)
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (!mounted.current || latest.current.scope !== snapshot.scope) { stream.getTracks().forEach(track => track.stop()); return false }
      setRecordingAudioMode('play-and-record')
      const session = startAudioRecordingSession(stream)
      const current: Take = { session, stream, startedAt: performance.now(), meta: { id: newKey('ensaio-audio'), scope: snapshot.scope, scriptKey: snapshot.script.key, title: snapshot.script.title, content: snapshot.script.content, fraction: snapshot.fraction(), settings: snapshot.settings, createdAt: Date.now(), duration: 0, type: '' } }
      take.current = current
      // Attach immediately: device interruptions can reject before the user stops.
      void session.result.then(() => { if (!current.finishing) void finish().catch(() => undefined) }, () => { if (!current.finishing) void finish().catch(() => undefined) })
      setElapsed(0); setStatus('recording')
      return true
    } catch { stream?.getTracks().forEach(track => track.stop()); prepareRecordedPlayback(); if (mounted.current) { setStatus('idle'); setMessage('Não foi possível abrir o microfone. Confira a permissão e tente novamente.') }; return false }
    finally { requesting.current = false }
  }, [finish])
  useEffect(() => {
    mounted.current = true
    const onHide = () => { if (document.hidden) void finish().catch(() => undefined) }
    const timer = window.setInterval(() => {
      const current = take.current
      if (current && !current.saved && !current.finishing) {
        const seconds = (performance.now() - current.startedAt) / 1000
        setElapsed(seconds)
        if (seconds >= 1800) void finish().catch(() => undefined)
      }
    }, 500)
    document.addEventListener('visibilitychange', onHide)
    return () => { mounted.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onHide); void finish().catch(() => undefined) }
  }, [finish])
  useEffect(() => { if (take.current && take.current.meta.scope !== scope) void finish().catch(() => undefined) }, [scope, finish])
  return { status, message, elapsed, start, finish, active: status === 'recording' || status === 'requesting' || status === 'saving', unsaved: status === 'error' }
}
