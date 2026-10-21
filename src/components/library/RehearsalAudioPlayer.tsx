import { useEffect, useState } from 'react'
import { getRehearsalAudio, type RehearsalAudio } from '../../lib/rehearsals'
import { prepareRecordedPlayback } from '../../lib/recordingAudio'
import { isShareCancelled, shareVideo } from '../../lib/share'
import { useAppStore } from '../../store/useAppStore'
import { mediaScope } from '../../lib/videoProjects'

export default function RehearsalAudioPlayer({ item }: { item: RehearsalAudio }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true; let objectUrl: string | undefined
    void getRehearsalAudio(item.scope, item.id).then(blob => {
      if (!live) return
      if (!blob) throw new Error('Áudio não encontrado neste aparelho.')
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl)
    }).catch(() => { if (live) setError('Não foi possível abrir o áudio do ensaio.') })
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item.scope, item.id])
  const share = async () => {
    setBusy(true); setError(null)
    try {
      const store = useAppStore.getState()
      if (mediaScope(store.mediaOwner, store.cloudWorkspace?.id ?? null) !== item.scope) return
      const blob = await getRehearsalAudio(item.scope, item.id)
      if (!blob) throw new Error('Áudio não encontrado.')
      await shareVideo({ blob, fileName: `ensaio-${item.id}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, title: item.title })
    } catch (e) { if (!isShareCancelled(e)) setError('Não foi possível compartilhar. O áudio continua salvo na biblioteca.') }
    finally { setBusy(false) }
  }
  return <div className="mt-3 space-y-2">
    {url && <audio aria-label={`Áudio do ensaio ${item.title}`} src={url} controls onPlay={prepareRecordedPlayback} className="w-full" />}
    <button disabled={!url || busy} className="min-h-11 rounded-xl border px-3 text-sm" onClick={() => void share()}>{busy ? 'Preparando áudio…' : 'Salvar / compartilhar áudio'}</button>
    {error && <p role="alert" className="text-sm">{error}</p>}
  </div>
}
