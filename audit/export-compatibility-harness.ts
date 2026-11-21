import { CAPTION_THEMES, renderVideo } from '../src/lib/video/render'
import { readVideoInfo } from '../src/lib/video/metadata'
import { inspectMp4 } from '../src/lib/video/integrity'
const result=document.querySelector<HTMLPreElement>('#result')!, button=document.querySelector<HTMLButtonElement>('#run')!
button.onclick=async()=>{
  button.disabled=true
  const start=performance.now(), progress:number[]=[]
  try{
    const sourceBlob=await(await fetch('/audit/bigvu-2026-10-16/benchmark/long-source.mp4')).blob()
    const meta=await readVideoInfo(sourceBlob)
    const blob=await renderVideo({sourceBlob,targetWidth:640,targetHeight:360,crop:{sx:0,sy:0,sw:meta.width,sh:meta.height},keepRanges:[{start:0,end:60}],captions:[],theme:CAPTION_THEMES.find(t=>t.key==='none')!,motion:'zoom-in',onProgress:p=>{progress.push(p);result.textContent=`Processando ${(p*100).toFixed(1)}% · ${((performance.now()-start)/1000).toFixed(1)}s`}})
    const info=await readVideoInfo(blob),integrity=await inspectMp4(blob)
    const ac=new AudioContext();await ac.resume();const audio=await ac.decodeAudioData(await blob.arrayBuffer());const channel=audio.getChannelData(0);const rms=Math.sqrt(channel.reduce((n,v)=>n+v*v,0)/channel.length);await ac.close()
    const url=URL.createObjectURL(blob), video=document.querySelector<HTMLVideoElement>('#preview')!;video.src=url;video.muted=true
    await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(Error('Sem imagem'))})
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;const ctx=canvas.getContext('2d')!;const samples:number[]=[]
    for(const time of [1,20,40,58]){await new Promise<void>(resolve=>{video.onseeked=()=>resolve();video.currentTime=time});ctx.drawImage(video,0,0,64,36);const data=ctx.getImageData(0,0,64,36).data;samples.push(data.reduce((n,v,i)=>n+(i%4===3?0:v),0))}
    const good=info.duration>=59&&info.duration<=61&&rms>.001&&!integrity?.problem&&new Set(samples).size>1
    result.textContent=JSON.stringify({status:good?'PASS':'FAIL',seconds:(performance.now()-start)/1000,info,integrity,rms,samples,progressUpdates:progress.length,monotonic:progress.every((p,i)=>i===0||p>=progress[i-1])},null,2)
    const a=document.createElement('a');a.href=url;a.download='qa-exportacao-60s.mp4';a.textContent='Baixar resultado QA';document.querySelector('#files')!.append(a)
  }catch(error){result.textContent=`FAIL ${String(error)}`}finally{button.disabled=false}
}

const guards=document.querySelector<HTMLButtonElement>('#guards')!
guards.onclick=async()=>{
  guards.disabled=true
  const original=HTMLVideoElement.prototype.requestVideoFrameCallback
  try{
    const sourceBlob=await(await fetch('/audit/bigvu-2026-10-16/benchmark/long-source.mp4')).blob()
    const meta=await readVideoInfo(sourceBlob)
    const config={sourceBlob,targetWidth:640,targetHeight:360,crop:{sx:0,sy:0,sw:meta.width,sh:meta.height},keepRanges:[{start:0,end:60}],captions:[],theme:CAPTION_THEMES.find(t=>t.key==='none')!}
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),1000)
    let cancelled=false
    try{await renderVideo({...config,signal:controller.signal})}catch(error){cancelled=(error as Error).name==='AbortError'}finally{clearTimeout(timer)}
    result.textContent=`Cancelamento: ${cancelled?'PASS':'FAIL'}. Simulando quadros interrompidos com áudio em andamento…`
    HTMLVideoElement.prototype.requestVideoFrameCallback=()=>0
    const start=performance.now()
    let interruption=''
    try{await renderVideo(config)}catch(error){interruption=(error as Error).message}
    const seconds=(performance.now()-start)/1000
    const passed=cancelled&&interruption.includes('parou de enviar imagens')&&seconds<20&&document.querySelectorAll('video[aria-label="Vídeo em processamento"]').length===0
    result.textContent=JSON.stringify({status:passed?'PASS':'FAIL',cancelled,interruption,seconds,decoderElementsLeft:document.querySelectorAll('video[aria-label="Vídeo em processamento"]').length},null,2)
  }catch(error){result.textContent=`FAIL ${String(error)}`}finally{HTMLVideoElement.prototype.requestVideoFrameCallback=original;guards.disabled=false}
}
