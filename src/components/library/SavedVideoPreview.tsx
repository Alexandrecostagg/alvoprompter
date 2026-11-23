import { useEffect, useRef, useState } from 'react'
import { useModalFocus } from '../../hooks/useModalFocus'
import { isShareCancelled, saveVideo, shareVideo } from '../../lib/share'

export interface SavedVideo { blob: Blob; title: string; kind: 'original' | 'final' }
export default function SavedVideoPreview({ video, onClose }: { video: SavedVideo; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus(dialog, true, onClose)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { const source = URL.createObjectURL(video.blob); setUrl(source); return () => URL.revokeObjectURL(source) }, [video.blob])
  const deliver = async (share: boolean) => {
    setBusy(true); setMessage('')
    try {
      const ext = video.blob.type.includes('quicktime') ? 'mov' : video.blob.type.includes('mp4') ? 'mp4' : 'webm'
      const outcome = await (share ? shareVideo : saveVideo)({ blob: video.blob, fileName: `${video.title}-${video.kind}.${ext}`, title: video.title })
      setMessage(outcome === 'shared' ? 'Escolha Salvar Vídeo ou Salvar em Arquivos no menu do aparelho para guardar uma cópia.' : 'Download solicitado. Confira a pasta de downloads.')
    } catch (error) { if (!isShareCancelled(error)) setMessage(error instanceof Error ? error.message : 'Não foi possível preparar o vídeo. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={video.kind === 'final' ? 'Vídeo final salvo' : 'Gravação original'} className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-2xl p-4" style={{ background: 'var(--panel)' }}>
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{video.kind === 'final' ? 'Vídeo final salvo' : 'Gravação original'}</h2><button onClick={onClose} className="min-h-11 rounded-xl border px-3">Fechar</button></div>
      <p className="mt-2 text-sm">{video.title}</p>
      {url && <video src={url} controls playsInline preload="metadata" disablePictureInPicture className="mx-auto my-4 max-h-[50dvh] w-full rounded-xl" />}
      <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void deliver(false)} className="min-h-11 rounded-xl border px-4">{busy ? 'Preparando…' : 'Salvar no aparelho'}</button><button disabled={busy} onClick={() => void deliver(true)} className="min-h-11 rounded-xl border px-4">Compartilhar vídeo</button></div>
      <p role="status" className="mt-3 text-sm">{message}</p>
    </div>
  </div>
}
