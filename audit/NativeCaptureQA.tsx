import { useCallback, useEffect, useState } from 'react'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import PrompterView from '../src/components/prompter/PrompterView'
import VideoEditor from '../src/components/editor/VideoEditor'
import ScriptLibrary from '../src/components/library/ScriptLibrary'
import { useAppStore } from '../src/store/useAppStore'
import { DEFAULT_SETTINGS } from '../src/lib/types'
import { listVideoProjects, getVideoProject, mediaScope } from '../src/lib/videoProjects'
import { nativeCamera } from '../src/lib/capture/IosCameraPort'
import { recoverNativeTakes } from '../src/lib/capture/recovery'
import { db } from '../src/lib/db'
import { CAPTION_THEMES, renderVideo } from '../src/lib/video/render'

const instructions = 'Teste de gravação. Movimente um objeto na frente da câmera e diga o tempo em voz alta a cada dez segundos. Pause o texto, arraste para baixo e retome. A câmera deve continuar gravando. Ao completar dois minutos, toque em Parar gravação. '
const events: object[] = []
let logQueue: Promise<unknown> = Promise.resolve()
function log(event: string, fields: object = {}) {
  events.push({ at: new Date().toISOString(), event, ...fields })
  const data = JSON.stringify(events, null, 2)
  logQueue = logQueue.catch(() => undefined).then(() => Filesystem.writeFile({ path: 'capture-qa-log.json', data, directory: Directory.Data, encoding: Encoding.UTF8 })).catch(() => undefined)
}
export default function NativeCaptureQA() {
  const view = useAppStore(s => s.view)
  const [started, setStarted] = useState(false)
  const [opening, setOpening] = useState(true)
  const [status, setStatus] = useState('Abrindo vídeos gravados…')
  const [report, setReport] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const openSavedVideo = useCallback(async () => {
    setOpening(true); setProblem(null); setStatus('Recuperando a gravação salva…')
    log('restore-start', { revision: 'native-range-read-2' })
    const state = useAppStore.getState()
    const scope = mediaScope(state.mediaOwner, state.cloudWorkspace?.id ?? null)
    let lastLog = -20
    try {
      await nativeCamera.release()
      log('camera-released')
      const recovered = await recoverNativeTakes(scope, progress => {
        const percent = Math.floor(progress.loaded / progress.total * 100)
        setStatus(`Abrindo vídeo gravado… ${percent}%`)
        if (percent >= lastLog + 20 || percent === 100) { log('read', progress); lastLog = percent }
      }, issue => log('restore-issue', issue))
      const projects = await listVideoProjects(scope)
      log('restore-result', { ...recovered, projects: projects.length })
      if (!projects.length) {
        if (recovered.failed) throw new Error('O original está guardado, mas ainda não foi possível abrir o vídeo. Toque em Tentar novamente.')
        setStarted(false); setReport('Nenhum vídeo gravado neste app de teste ainda.'); return
      }
      const project = await getVideoProject(projects[0]!.id, scope)
      if (!project) throw new Error('Não foi possível abrir a gravação salva.')
      const current = useAppStore.getState()
      if (mediaScope(current.mediaOwner, current.cloudWorkspace?.id ?? null) !== scope) return
      current.selectScript(current.scripts.find(script => script.key === project.scriptKey) ?? null)
      current.setRecording({ blob: project.blob, url: '', project, srt: project.srt, utterances: project.utterances })
      current.setLibrarySection('videos'); current.setView('video-editor')
      setStarted(true)
      log('editor-open', { id: project.id, bytes: project.blob.size, type: project.blob.type, frames: project.captureValidation?.frames })
      if (import.meta.env.VITE_EXPORT_QA === 'true') {
        const duration = project.captureValidation?.duration ?? 126
        for (const sample of [{ name: 'late-zoom-caption', start: Math.max(0, duration - 36), end: duration - 6 }, { name: 'full-zoom', start: 0, end: duration - .1 }]) {
          setStatus(`Teste automático · ${sample.name}…`)
          const began = Date.now(); let previous = -1
          log('export-start', { ...sample, id: project.id })
          const result = await renderVideo({ sourceBlob: project.blob, nativeSource: { id: project.id, scope },
            targetWidth: 720, targetHeight: 1280, crop: { sx: 0, sy: 0, sw: 720, sh: 1280 },
            keepRanges: [{ start: sample.start, end: sample.end }], motion: 'zoom-in',
            captions: sample.name.includes('caption') ? [{ start: sample.start, end: sample.end, text: 'Teste do vídeo final em movimento' }] : [],
            theme: CAPTION_THEMES[1]!, videoBitsPerSecond: 2_500_000,
            onProgress: fraction => { const percent = Math.round(fraction * 100); setStatus(`Teste automático · ${sample.name} · ${percent}%`); if (percent >= previous + 10) { log('export-progress', { name: sample.name, percent }); previous = percent } },
          })
          log('export-complete', { name: sample.name, bytes: result.size, type: result.type, elapsed: (Date.now() - began) / 1000 })
        }
        log('exports-passed')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProblem(message); log('restore-error', { message })
    } finally { setOpening(false) }
  }, [])
  useEffect(() => useAppStore.subscribe((state, previous) => {
    if (state.view !== previous.view || state.recordingSaveStatus !== previous.recordingSaveStatus) log('view', { view: state.view, saveStatus: state.recordingSaveStatus, bytes: state.recording?.blob.size, error: state.recordingSaveError })
  }), [])
  useEffect(() => { void openSavedVideo() }, [openSavedVideo])
  const begin = async () => {
    const now = Date.now()
    const script = { key: crypto.randomUUID(), title: 'Teste nativo · dois minutos', content: instructions.repeat(10), createdAt: now, updatedAt: now }
    await useAppStore.getState().upsertScript(script)
    useAppStore.setState({ currentScript: script, settings: { ...DEFAULT_SETTINGS, cameraOn: true, mode: 'fixed', openMic: true, fontSize: 44, wpm: 150 }, view: 'prompter' })
    setStarted(true)
  }
  const inspect = async () => {
    const scope = mediaScope(null, null)
    try {
      const { takes } = await nativeCamera.pendingTakes({ scope })
      const projects = await listVideoProjects(scope)
      const sources = await Promise.all(projects.map(async row => {
        const project = await getVideoProject(row.id, scope)
        return { id: row.id, title: row.title, bytes: project?.blob.size, type: project?.blob.type, validation: project?.captureValidation, warning: project?.captureWarning, versions: await db.videoVersions.where('projectId').equals(row.id).count() }
      }))
      const result = { platform: 'iOS AVFoundation', pendingRecovery: takes.length, sources }
      setReport(JSON.stringify(result, null, 2)); log('report', result)
    } catch (error) { setReport(String(error)); log('report-error', { message: String(error) }) }
  }
  const pageStyle = { padding: 'max(60px, env(safe-area-inset-top)) 20px 40px', background: 'var(--bg)', minHeight: '100dvh' }
  if (opening || problem) return <main style={pageStyle}><h1 className="text-xl font-bold">Seu vídeo gravado</h1><p role="status" className="my-5">{problem ?? status}</p>{opening ? <p>A tomada original continua salva neste iPhone.</p> : <button className="min-h-12 rounded-xl border px-4" onClick={() => void openSavedVideo()}>Tentar novamente</button>}</main>
  if (!started) return <main style={pageStyle}><h1>Alvo Captura QA</h1><p className="my-4">Teste separado, com suas gravações preservadas neste app.</p><button className="my-2 min-h-12 w-full rounded-xl border px-4 font-semibold" onClick={() => void openSavedVideo()}>Retomar último vídeo gravado</button><button className="my-2 min-h-12 w-full rounded-xl border px-4" onClick={() => { useAppStore.setState({ view: 'library', librarySection: 'videos' }); setStarted(true) }}>Ver vídeos gravados</button><button className="my-2 min-h-12 rounded-xl border px-4" onClick={() => void begin()}>Iniciar nova gravação de teste</button><button className="m-2 min-h-12 rounded-xl border px-4" onClick={() => void inspect()}>Conferir tomadas QA</button><pre className="whitespace-pre-wrap text-xs">{report}</pre></main>
  return <>{view === 'prompter' ? <PrompterView /> : view === 'video-editor' ? <VideoEditor /> : <><div style={{ paddingTop: 'max(50px, env(safe-area-inset-top))' }}><button className="min-h-11 border px-4" onClick={() => void openSavedVideo()}>Retomar último vídeo gravado</button><button className="min-h-11 border px-4" onClick={() => setStarted(false)}>Outras opções QA</button></div><ScriptLibrary /></>}</>
}
