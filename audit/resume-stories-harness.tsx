import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PrompterView from '../src/components/prompter/PrompterView'
import ScriptLibrary from '../src/components/library/ScriptLibrary'
import ScriptEditor from '../src/components/editor/ScriptEditor'
import VideoEditor from '../src/components/editor/VideoEditor'
import { useAppStore } from '../src/store/useAppStore'
import { DEFAULT_SETTINGS } from '../src/lib/types'
import { startRecordingSession } from '../src/lib/recordingSession'
import { getVideoVersion, listVideoVersions } from '../src/lib/videoProjects'
import { getRehearsalAudio, listRehearsalAudios } from '../src/lib/rehearsals'
import { mediaScope } from '../src/lib/videoProjects'
import { readVideoInfo } from '../src/lib/video/metadata'
import '../src/index.css'

// Local QA only. Uses generated pixels and oscillator audio; never opens real capture hardware.
async function syntheticStream(constraints?: MediaStreamConstraints) {
  const canvas = document.createElement('canvas'); canvas.width=360; canvas.height=640
  const ctx=canvas.getContext('2d')!; let frame=0
  const draw=()=>{ctx.fillStyle='#394480';ctx.fillRect(0,0,360,640);ctx.fillStyle='#bdf0dc';ctx.fillRect((frame++*3)%260,200,100,100);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('VÍDEO SINTÉTICO QA',35,100)}
  draw(); const timer=setInterval(draw,33); const stream=canvas.captureStream(30)
  const audio=new AudioContext(); await audio.resume(); const oscillator=audio.createOscillator(); const gain=audio.createGain(); gain.gain.value=.02
  const output=audio.createMediaStreamDestination(); oscillator.connect(gain).connect(output); oscillator.start(); output.stream.getAudioTracks().forEach(t=>stream.addTrack(t))
  if (constraints?.video === false) {
    stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track) }); clearInterval(timer)
    const audioTrack = stream.getAudioTracks()[0]!; const stopAudio = audioTrack.stop.bind(audioTrack); audioTrack.stop = () => { stopAudio(); void audio.close() }; return stream
  }
  const track=stream.getVideoTracks()[0]!; const stop=track.stop.bind(track); track.stop=()=>{stop();clearInterval(timer);void audio.close()}
  return stream
}
navigator.mediaDevices.getUserMedia=syntheticStream
useAppStore.setState({mediaOwner:'qa-retomada-stories',view:'library',settings:{...DEFAULT_SETTINGS,cameraOn:false,wpm:150}})
const fixture={key:'qa-retomada-stories-script',title:'Ensaio e Stories — QA',content:('Este é um ensaio de retomada. O roteiro e o ponto de leitura precisam continuar disponíveis depois de sair da tela. ').repeat(12),createdAt:Date.now(),updatedAt:Date.now()}
useAppStore.getState().selectScript(fixture)

export function Harness(){
 const view=useAppStore(s=>s.view);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('QA local com mídia sintética.');const [visible,setVisible]=useState(true)
 const seed=async()=>{setBusy(true);try{setMessage('Criando tomada de 17 segundos…');const stream=await syntheticStream();const session=startRecordingSession(stream);await new Promise(r=>setTimeout(r,17000));session.stop();const blob=await session.result;stream.getTracks().forEach(t=>t.stop());useAppStore.getState().setRecording({blob,url:'',srt:null,utterances:[{at:0,text:'Primeira parte do vídeo de teste.'},{at:8,text:'Segunda parte com áudio preservado.'}],resumeFraction:.35});useAppStore.getState().setView('video-editor');setMessage(`Fonte pronta: ${blob.size} bytes; ${blob.type}`)}catch(e){setMessage(`FAIL ${(e as Error).message}`)}finally{setBusy(false)}}
 const verify=async()=>{setBusy(true);try{const project=useAppStore.getState().recording?.project;if(!project)throw new Error('Sem tomada');const versions=await listVideoVersions(project.id,project.scope);const parts=versions.filter(v=>v.label?.startsWith('Instagram Stories'));if(parts.length!==2)throw new Error(`Esperadas 2 partes, obtidas ${parts.length}`);let total=0;const checks=[];for(const summary of parts){const version=(await getVideoVersion(summary.id,summary.scope))!;const meta=await readVideoInfo(version.blob);const ctx=new AudioContext();const audio=await ctx.decodeAudioData(await version.blob.arrayBuffer());const samples=audio.getChannelData(0);const rms=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length);await ctx.close();if(meta.width!==720||meta.height!==1280||meta.duration>15||rms<.001)throw new Error(`Saída inválida: ${JSON.stringify(meta)}, RMS ${rms}`);total+=meta.duration;checks.push(`${summary.label}: ${meta.duration.toFixed(2)}s, ${meta.width}×${meta.height}, RMS ${rms.toFixed(4)}, ${version.blob.type}`)}if(total<16.5||total>18)throw new Error(`Duração total ${total}`);setMessage(`PASS — 2 partes persistidas, continuidade de duração e áudio conferidos.\n${checks.join('\n')}`)}catch(e){setMessage(`FAIL ${(e as Error).message}`)}finally{setBusy(false)}}
 const verifyAudio=async()=>{setBusy(true);try{const scope=mediaScope('qa-retomada-stories',null);const rows=await listRehearsalAudios(scope);const item=rows[0];if(!item)throw new Error('Sem áudio salvo');const blob=await getRehearsalAudio(scope,item.id);if(!blob)throw new Error('Sem fonte');const ctx=new AudioContext();const audio=await ctx.decodeAudioData(await blob.arrayBuffer());const samples=audio.getChannelData(0);const rms=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length);await ctx.close();if(rms<.001||audio.duration<1)throw new Error('Áudio vazio');setMessage(`PASS áudio persistido e decodificado: ${audio.duration.toFixed(2)}s, RMS ${rms.toFixed(4)}, ${blob.type}; ponto ${Math.round(item.fraction*100)}%; roteiro e ajustes preservados.`)}catch(e){setMessage(`FAIL ${(e as Error).message}`)}finally{setBusy(false)}}
 return <>{view==='prompter'?<PrompterView/>:view==='video-editor'?<VideoEditor/>:view==='editor'?<ScriptEditor/>:<ScriptLibrary/>}<aside style={{position:'fixed',bottom:0,right:0,zIndex:1000,maxWidth:500,background:'#fff',color:'#111',padding:5,fontSize:11,border:'1px solid #aaa'}}><button onClick={()=>setVisible(v=>!v)}>{visible?'Ocultar QA':'QA'}</button>{visible&&<><button disabled={busy} onClick={()=>void seed()}>Criar tomada sintética de 17s</button><button disabled={busy} onClick={()=>void verifyAudio()}>Verificar áudio salvo</button><button disabled={busy} onClick={()=>void verify()}>Verificar partes salvas</button><button disabled={busy} onClick={()=>useAppStore.getState().setView('library')}>Biblioteca QA</button><pre role="status" style={{whiteSpace:'pre-wrap'}}>{message}</pre></>}</aside></>
}
const root=createRoot(document.getElementById('root')!);root.render(<Harness/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount())
