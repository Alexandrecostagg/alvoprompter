import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useRecorder } from '../src/hooks/useRecorder'
import { CAPTION_THEMES, computeCrop, renderVideo } from '../src/lib/video/render'
import VideoEditor from '../src/components/editor/VideoEditor'
import { useAppStore } from '../src/store/useAppStore'
import { shareVideo } from '../src/lib/share'
// Local-only fixture: synthetic camera and audio avoid recording personal surroundings.
let animation: ReturnType<typeof setInterval>
let audio: AudioContext
navigator.mediaDevices.getUserMedia = async () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
  const ctx = canvas.getContext('2d')!
  let frame = 0
  animation = setInterval(() => { ctx.fillStyle = '#1355aa'; ctx.fillRect(0,0,640,360); ctx.fillStyle = '#ff6611'; ctx.fillRect(40 + (frame++ % 150),80,80,80) }, 33)
  const stream = canvas.captureStream(30)
  audio = new AudioContext(); await audio.resume()
  const oscillator = audio.createOscillator(); oscillator.frequency.value = 440
  const gain = audio.createGain(); gain.gain.value = 0.1
  const dest = audio.createMediaStreamDestination(); oscillator.connect(gain).connect(dest); oscillator.start()
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)
  return stream
}
export function Harness() {
  const rec = useRecorder()
  const [result, setResult] = useState('Pronto. Fonte sintética de 640 × 360 com tom de 440 Hz.')
  const [output, setOutput] = useState<Blob>()
  const [url, setUrl] = useState('')
  const configuration = () => ({ sourceBlob: rec.videoBlob!, targetWidth: 360, targetHeight: 640, crop: computeCrop(640,360,360,640), keepRanges: [{start:0.3,end:1.3},{start:1.8,end:2.8}], captions: [{start:0,end:4,text:'LEGENDA DE TESTE'}], theme: CAPTION_THEMES[1]!, onProgress: (p: number) => setResult(`Exportando ${Math.round(p*100)}%`) })
  const check = async () => {
    try {
      const blob = await renderVideo(configuration()); setOutput(blob)
      if (url) URL.revokeObjectURL(url)
      const next = URL.createObjectURL(blob); setUrl(next)
      const decoder = new AudioContext()
      const samples = await decoder.decodeAudioData(await blob.arrayBuffer())
      const data = samples.getChannelData(0)
      const rms = Math.sqrt(data.reduce((sum, v) => sum + v*v, 0) / data.length)
      await decoder.close()
      const v = document.createElement('video'); v.src = next; v.muted = true; v.playsInline = true
      await new Promise<void>((resolve, reject) => { v.onloadeddata = () => resolve(); v.onerror = () => reject(new Error('Saída não reproduzível')); v.load() })
      await new Promise<void>((resolve) => { v.onseeked = () => resolve(); v.currentTime = 0.5 })
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 640
      const ctx = canvas.getContext('2d')!; ctx.drawImage(v,0,0,360,640)
      const pixels = ctx.getImageData(0,580,360,60).data
      let captionPixels = 0
      for (let i=0;i<pixels.length;i+=4) if (pixels[i]>180 && pixels[i+1]>140 && pixels[i+2]<150) captionPixels++
      const pass = rms > 0.01 && samples.duration > 1.7 && samples.duration < 2.6 && v.videoWidth===360 && v.videoHeight===640 && captionPixels>100
      setResult(`${pass ? 'PASS' : 'FAIL'} — cortes + formato vertical + legenda + áudio\n${blob.type}; ${blob.size} bytes\nDuração de áudio: ${samples.duration.toFixed(3)}s (alvo 2s)\nRMS: ${rms.toFixed(4)}\nPixels amarelos da legenda: ${captionPixels}\nResolução: ${v.videoWidth} × ${v.videoHeight}`)
    } catch (error) { setResult(`FAIL: ${(error as Error).message}`) }
  }
  return <main><h1>Validação local do ciclo de vídeo</h1><p>Câmera e voz sintéticas. Usa o gravador, editor e compartilhamento reais do aplicativo.</p><button onClick={() => void rec.enable()}>Ativar fonte sintética</button><button disabled={rec.status!=='ready'} onClick={rec.start}>Gravar</button><button disabled={!rec.isRecording} onClick={() => { rec.stop(); clearInterval(animation); void audio.close() }}>Parar</button><p>Estado: {rec.status} · {rec.elapsed}s · {rec.videoBlob?.size ?? 0} bytes · {rec.error}</p><video ref={rec.attachVideo} autoPlay muted playsInline /><button disabled={!rec.videoBlob} onClick={() => void check()}>Editar, legendar e exportar</button><button disabled={!rec.videoBlob} onClick={async () => { const controller = new AbortController(); const task = renderVideo({...configuration(), signal:controller.signal}); setTimeout(()=>controller.abort(),200); try { await task; setResult('FAIL: cancelamento ignorado') } catch(e) { setResult((e as Error).name==='AbortError' ? 'PASS — cancelamento interrompeu a exportação' : `FAIL: ${(e as Error).message}`) } }}>Testar cancelamento</button><button disabled={!output} onClick={async () => { try { const result=await shareVideo({blob:output!,fileName:`qa-alvoprompter.${output!.type.includes('mp4')?'mp4':'webm'}`}); setResult(`Compartilhamento: ${result}`) } catch(e) { setResult(`Compartilhamento: ${(e as Error).message}`) } }}>Compartilhar ou baixar</button><button disabled={!rec.videoBlob} onClick={() => {useAppStore.getState().setRecording({blob:rec.videoBlob!,url:rec.videoUrl!,srt:null,utterances:[{at:0,text:'Legenda da gravação'},{at:2.8,text:'áudio preservado'}]}); root.render(<VideoEditor/>);}}>Abrir editor real</button><pre role="status">{result}</pre>{url && <video aria-label="Vídeo exportado" src={url} controls playsInline />}</main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness />)

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
