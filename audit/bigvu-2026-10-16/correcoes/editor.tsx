import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import VideoProjects from '../../../src/components/library/VideoProjects'
import { db } from '../../../src/lib/db'
import VideoEditor from '../../../src/components/editor/VideoEditor'
import { useAppStore } from '../../../src/store/useAppStore'
import '../../../src/index.css'

function storageFull() { throw new DOMException('Test storage full', 'QuotaExceededError') }

export function EditorTest() {
  const view = useAppStore(s => s.view)
  const [storageFailure, setStorageFailure] = useState(false)
  const [longVideo, setLongVideo] = useState(false)
  const [transcript, setTranscript] = useState(true)
  const [samples, setSamples] = useState<number[]>([])
  async function load() {
    const blob = await (await fetch(longVideo ? '../benchmark/long-source.mp4' : '../benchmark/source.mp4')).blob()
    useAppStore.getState().setRecording({ blob, url: '', srt: null, utterances: transcript ? [
      { text: 'Ahn, o produto custa cem reais.', at: 2 },
      { text: 'Este tipo de câmera tem boa imagem.', at: 5 },
      { text: 'O restante deve ser preservado.', at: 7.8 },
    ] : [] })
    setSamples([])
    useAppStore.getState().setView('video-editor')
  }
  return <div onTimeUpdateCapture={event => {
    const video = event.target as HTMLVideoElement
    if (video.getAttribute('aria-label') === 'Prévia dos cortes com áudio') setSamples(previous => [...previous.slice(-49), Number(video.currentTime.toFixed(3))])
  }}><div className="p-4 flex flex-wrap items-center gap-4 border-b">
    <strong>Teste local · vídeo sintético de 8 s</strong>
    <label><input type="checkbox" checked={transcript} onChange={e => setTranscript(e.target.checked)} /> Com transcrição</label>
    <label><input type="checkbox" checked={longVideo} onChange={e => setLongVideo(e.target.checked)} /> Vídeo de 60 segundos</label>
    <button className="min-h-11 border rounded px-3" onClick={() => {
      const fail = storageFull
      if (!storageFailure) { db.videoProjects.hook('creating', fail); db.videoProjects.hook('updating', fail) }
      else { db.videoProjects.hook('creating').unsubscribe(fail); db.videoProjects.hook('updating').unsubscribe(fail) }
      setStorageFailure(!storageFailure)
    }}>{storageFailure ? 'Restaurar armazenamento' : 'Simular armazenamento cheio'}</button>
    <button className="min-h-11 border rounded px-3" onClick={() => { useAppStore.getState().setView('library'); useAppStore.getState().setRecording(null) }}>Abrir biblioteca de teste</button>
    <button className="min-h-11 border rounded px-3" onClick={() => void load()}>Carregar vídeo de teste</button>
  </div><details className="p-4"><summary>Amostras da prévia</summary><output aria-label="Tempos observados da prévia">{JSON.stringify(samples)}</output></details>{view === 'video-editor' ? <VideoEditor /> : <VideoProjects />}</div>
}
createRoot(document.getElementById('root')!).render(<EditorTest />)
