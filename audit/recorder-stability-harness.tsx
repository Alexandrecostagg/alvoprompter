import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useRecorder } from '../src/hooks/useRecorder'

// Test-only camera and microphone: never request the user's hardware.
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
let requests = 0, captures = 0, previewAssignments = 0, requestDelay = 0
const sessions: { stream: MediaStream; close: () => void }[] = []
const captureStream = HTMLCanvasElement.prototype.captureStream
HTMLCanvasElement.prototype.captureStream = function (fps) { captures++; return captureStream.call(this, fps) }
navigator.mediaDevices.getUserMedia = async () => {
  requests++
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
  const ctx = canvas.getContext('2d')!
  let position = 0
  const draw = () => { ctx.fillStyle = '#1355aa'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#ff6611'; ctx.fillRect(30 + (++position % 450), 80, 60, 80) }
  draw()
  const animation = setInterval(draw, 33)
  const stream = canvas.captureStream(30)
  const audio = new AudioContext(); await audio.resume()
  const oscillator = audio.createOscillator(); oscillator.frequency.value = 440
  const gain = audio.createGain(); gain.gain.value = .01
  const destination = audio.createMediaStreamDestination(); oscillator.connect(gain).connect(destination); oscillator.start()
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track))
  let closed = false
  sessions.push({ stream, close: () => { if (closed) return; closed = true; clearInterval(animation); stream.getTracks().forEach((track) => track.stop()); void audio.close() } })
  await delay(requestDelay)
  return stream
}
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await delay(50) }
  throw new Error('Tempo de espera excedido')
}
async function inspectRecording(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video'); video.src = url; video.muted = true; video.playsInline = true
  try {
    video.load(); await waitFor(() => video.readyState >= 2)
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d')!
    const positions: number[] = []
    for (const time of [.5, 1.5, 2.5, 3.5]) {
      video.currentTime = time
      await waitFor(() => !video.seeking && Math.abs(video.currentTime - time) < .1)
      ctx.drawImage(video, 0, 0, 640, 360)
      const background = ctx.getImageData(600, 300, 1, 1).data
      if (background[2] < 80) throw new Error(`Quadro preto em ${time}s`)
      const row = ctx.getImageData(0, 120, 640, 1).data
      let x = 0, count = 0
      for (let i = 0; i < 640; i++) if (row[i * 4] > 160 && row[i * 4 + 2] < 100) { x += i; count++ }
      if (!count) throw new Error(`Movimento ausente em ${time}s`)
      positions.push(Math.round(x / count))
    }
    if (new Set(positions).size !== 4) throw new Error('Quadros congelados no arquivo salvo')
    return { bytes: blob.size, type: blob.type, positions, duration: video.duration }
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
}
export function Harness() {
  const rec = useRecorder()
  const latest = useRef(rec); latest.current = rec
  const [css, setCss] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState('Pronto. Câmera sintética, sem acesso ao hardware.')
  // Deliberately repeat the former component behavior to prove hook idempotency too.
  useEffect(() => { rec.setFilter(css) }, [rec, css])
  const attach = useCallback((element: HTMLVideoElement | null) => {
    if (element && !Object.hasOwn(element, 'srcObject')) {
      const property = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')!
      Object.defineProperty(element, 'srcObject', { get() { return property.get!.call(this) }, set(value) { previewAssignments++; property.set!.call(this, value) } })
    }
    latest.current.attachVideo(element)
  }, [])
  const run = async () => {
    setBusy(true); setReport('Testando…')
    const lines: string[] = []
    try {
      for (const filter of [null, 'brightness(1.05) contrast(1.03)']) {
        latest.current.disable()
        setCss(filter); latest.current.setFilter(filter)
        const before = { requests, captures, previewAssignments }
        await Promise.all([latest.current.enable(), latest.current.enable()])
        await delay(250)
        latest.current.start()
        await waitFor(() => latest.current.isRecording)
        const renders = setInterval(() => setTick((value) => value + 1), 40)
        try { await delay(4200) } finally { clearInterval(renders) }
        if (!latest.current.isRecording) throw new Error('A gravação parou antes do comando')
        const input = sessions.at(-1)!.stream
        if (input.getTracks().some((track) => track.readyState !== 'live')) throw new Error('Câmera ou microfone interrompido')
        if (requests - before.requests !== 1 || captures - before.captures !== (filter ? 2 : 1) || previewAssignments - before.previewAssignments !== 1) throw new Error('Reabertura da câmera ou reconstrução do vídeo durante atualizações')
        const previous = latest.current.videoBlob
        latest.current.stop()
        await waitFor(() => Boolean(latest.current.videoBlob && latest.current.videoBlob !== previous))
        const recording = await inspectRecording(latest.current.videoBlob!)
        lines.push(`PASS ${filter ? 'com filtro' : 'sem filtro'}: uma câmera, uma ligação da prévia, vídeo contínuo. ${JSON.stringify(recording)}`)
        latest.current.disable(); sessions.at(-1)!.close()
      }
      requestDelay = 200
      const pending = latest.current.enable()
      latest.current.disable()
      await pending; await delay(50)
      if (sessions.at(-1)!.stream.getTracks().some((track) => track.readyState !== 'ended')) throw new Error('Permissão tardia deixou a câmera aberta')
      lines.push('PASS cancelamento durante abertura: câmera e microfone liberados.')
      setReport(lines.join('\n'))
    } catch (error) { setReport(`${lines.join('\n')}\nFAIL: ${(error as Error).message}`) }
    finally { latest.current.disable(); sessions.forEach((session) => session.close()); requestDelay = 0; setBusy(false) }
  }
  return <main><h1>Estabilidade da gravação</h1><p>Atualizações forçadas: {tick} · estado: {rec.status} · contador: {rec.elapsed}s</p><p>{rec.error}</p><video aria-label="Prévia sintética" ref={attach} autoPlay playsInline muted style={{ filter: css || undefined }} /><div><button disabled={busy} onClick={() => void run()}>Executar testes de estabilidade</button></div><pre role="status">{report}</pre></main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness />)
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); sessions.forEach((session) => session.close()) })
