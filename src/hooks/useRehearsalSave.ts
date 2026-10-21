import { useCallback, useEffect, useRef, useState } from 'react'
import { getRehearsal, saveRehearsal, type Rehearsal } from '../lib/rehearsals'
import { mediaScope } from '../lib/videoProjects'
import type { PrompterSettings, Script } from '../lib/types'
import type { usePrompterEngine } from './usePrompterEngine'
import { useAppStore } from '../store/useAppStore'

export function useRehearsalSave(script: Script | null, settings: PrompterSettings, engine: ReturnType<typeof usePrompterEngine>) {
  const owner = useAppStore(s => s.mediaOwner)
  const workspace = useAppStore(s => s.cloudWorkspace?.id ?? null)
  const scope = mediaScope(owner, workspace)
  const latest = useRef({ script, settings, engine, scope })
  latest.current = { script, settings, engine, scope }
  const [resume, setResume] = useState<Rehearsal | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setResume(null)
    if (script?.key) void getRehearsal(scope, script.key).then(session => { if (live && session?.content === script.content) setResume(session) }).catch(() => { if (live) setMessage('Não foi possível recuperar o ensaio salvo.') })
    return () => { live = false }
  }, [scope, script?.key, script?.content])
  const persist = useCallback(async (notify = true) => {
    const now = latest.current
    const store = useAppStore.getState()
    if (!now.script?.key || !now.script.content.trim() || mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== now.scope) return
    try {
      await saveRehearsal({ scope: now.scope, scriptKey: now.script.key, title: now.script.title, content: now.script.content, fraction: now.engine.fraction.current, settings: now.settings, updatedAt: Date.now() })
      if (notify) setMessage('Ensaio salvo. Retome em Roteiros → Seus ensaios.')
    } catch (error) { if (notify) setMessage('Não foi possível salvar o ensaio. Libere espaço e tente novamente.'); throw error }
  }, [])
  useEffect(() => {
    const saveProgress = () => { if (latest.current.engine.fraction.current > 0) void persist(false).catch(() => setMessage('O ensaio ainda não foi salvo. Toque em Salvar ensaio para tentar novamente.')) }
    const id = window.setInterval(saveProgress, 5000)
    document.addEventListener('visibilitychange', saveProgress)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', saveProgress); saveProgress() }
  }, [persist])
  useEffect(() => { if (engine.state === 'paused' || engine.state === 'done') void persist(false).catch(() => setMessage('Não foi possível guardar o ponto de leitura. Tente Salvar ensaio.')) }, [engine.state, persist])
  return { resume, message, save: persist, restore: () => {
    if (!resume) return
    useAppStore.getState().updateSettings(resume.settings)
    engine.stop()
    if (resume.fraction > 0 && resume.fraction < 1) engine.seekToFraction(resume.fraction)
    setResume(null)
    setMessage('Ensaio recuperado. Toque em iniciar ou gravar para continuar.')
  } }
}
