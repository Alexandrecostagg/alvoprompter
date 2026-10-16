import { useCallback, useEffect, useRef, useState } from 'react'
import { createVideoProject, updateVideoProject, videoStorageError, type VideoEdit, type VideoProject } from '../lib/videoProjects'

export function useVideoProjectSave(project: VideoProject | undefined, edit: VideoEdit | null) {
  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [retry, setRetry] = useState(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)
  const revision = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!project || !edit) return
    const version = ++revision.current
    setStatus('saving')
    // Queue immediately: navigating away must not discard a pending debounce.
    queue.current = queue.current.catch(() => {}).then(async () => {
      await createVideoProject(project)
      await updateVideoProject(project.id, project.scope, { edit })
    })
    void queue.current.then(() => { if (mounted.current && version === revision.current) setStatus('saved') }, () => { if (mounted.current && version === revision.current) setStatus('error') })
  }, [project, edit, retry])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status !== 'saved') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])
  return { status, error: status === 'error' ? videoStorageError() : null, retry: () => setRetry(n => n + 1), flush: useCallback(() => queue.current, []) }
}
