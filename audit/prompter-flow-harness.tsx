import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PrompterView from '../src/components/prompter/PrompterView'
import VideoEditor from '../src/components/editor/VideoEditor'
import { useAppStore } from '../src/store/useAppStore'
import { DEFAULT_SETTINGS } from '../src/lib/types'
import '../src/index.css'

const query = new URLSearchParams(location.search)
if (query.has('iphone')) {
  Object.defineProperty(navigator, 'userAgent', { value: 'iPhone QA' })
  const style = document.createElement('style')
  style.textContent = '.prompter-screen > div:first-child { padding-top: 55px !important; } .prompter-settings-overlay,.prompter-result-overlay { padding-top:55px !important; }'
  document.head.append(style)
}
const audioSession = { type: 'auto' }
Object.defineProperty(navigator, 'audioSession', { value: audioSession, configurable: true })
const streams: MediaStream[] = []
if (query.has('unsupported-filter')) Reflect.deleteProperty(CanvasRenderingContext2D.prototype, 'filter')
// Synthetic camera only: this harness never requests camera/microphone hardware.
navigator.mediaDevices.getUserMedia = async () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
  const ctx = canvas.getContext('2d')!
  let x = 0
  const draw = () => { ctx.fillStyle = '#264b7e'; ctx.fillRect(0,0,640,360); ctx.fillStyle = '#e9c543'; ctx.fillRect((x += 5) % 600,80,40,120) }
  draw()
  const timer = setInterval(draw, 33)
  const stream = canvas.captureStream(30)
  const audio = new AudioContext(); void audio.resume()
  const source = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = .01
  const destination = audio.createMediaStreamDestination(); source.connect(gain).connect(destination); source.start()
  destination.stream.getAudioTracks().forEach(track => stream.addTrack(track))
  const track = stream.getVideoTracks()[0]
  const stop = track.stop.bind(track)
  track.stop = () => { stop(); clearInterval(timer); void audio.close() }
  streams.push(stream)
  return stream
}
if (query.has('empty')) {
  class EmptyEncoder {
    static isTypeSupported = () => true
    mimeType = 'video/mp4'
    state = 'inactive'
    onstop: (() => void) | null = null
    ondataavailable: ((e: {data:Blob}) => void) | null = null
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable?.({data:new Blob([])}); this.onstop?.() }, 600) }
  }
  Object.defineProperty(window, 'MediaRecorder', { value: EmptyEncoder })
}
useAppStore.setState({ view: 'prompter', currentScript: { id: 991, title: 'Teste de gravação', content: 'Primeiro prepare seu roteiro. Depois olhe para a câmera e fale com calma.', createdAt: Date.now(), updatedAt: Date.now() }, settings: { ...DEFAULT_SETTINGS, cameraOn: !query.has('reading'), mode: query.has('voice') ? 'voice' : 'fixed', wpm: 300, fontSize: 48, beauty: query.has('unsupported-filter') ? 'glamour' : 'none' } })
function Harness() {
  const view = useAppStore(s => s.view)
  const [capture, setCapture] = useState('')
  useEffect(() => {
    const timer = setInterval(() => setCapture(`microfones ativos: ${streams.flatMap(s => s.getAudioTracks()).filter(t => t.readyState === 'live').length}; sessão: ${audioSession.type}`), 100)
    return () => clearInterval(timer)
  }, [])
  return <><output aria-label="Diagnóstico de captura" style={{position:'fixed',bottom:0,right:0,zIndex:100,fontSize:9,background:'#fff',color:'#000'}}>{capture}</output>{view === 'video-editor' ? <VideoEditor /> : view === 'editor' ? <p>Roteiro recuperado</p> : <PrompterView />}</>
}
createRoot(document.getElementById('root')!).render(<Harness />)
