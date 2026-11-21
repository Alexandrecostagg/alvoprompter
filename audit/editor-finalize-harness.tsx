import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import VideoEditor from '../src/components/editor/VideoEditor'
import { useAppStore } from '../src/store/useAppStore'
import { inspectMp4 } from '../src/lib/video/integrity'
import { getVideoVersion, listVideoVersions } from '../src/lib/videoProjects'
import { readVideoInfo } from '../src/lib/video/metadata'
import '../src/index.css'

useAppStore.setState({mediaOwner:'qa-finalize-20261121'})
export function Harness() {
  const [ready,setReady]=useState(false), [report,setReport]=useState('Mídia sintética local, sem câmera pessoal e sem publicação.')
  const load=async()=>{
    const blob=await(await fetch('/audit/bigvu-2026-10-16/benchmark/source.mp4')).blob()
    useAppStore.getState().setRecording({blob,url:'',utterances:[],srt:null})
    setReady(true);setReport('Fonte de teste carregada.')
  }
  const verify=async()=>{
    try {
      const project=useAppStore.getState().recording?.project
      if (!project) throw new Error('Sem projeto')
      const versions=await listVideoVersions(project.id,project.scope)
      const saved=versions[0]&&await getVideoVersion(versions[0].id,project.scope)
      if(!saved)throw new Error('Sem exportação salva')
      const info=await readVideoInfo(saved.blob)
      const integrity=await inspectMp4(saved.blob)
      const audio=new AudioContext();await audio.resume()
      const decoded=await audio.decodeAudioData(await saved.blob.arrayBuffer())
      const samples=decoded.getChannelData(0)
      const rms=Math.sqrt(samples.reduce((n,v)=>n+v*v,0)/samples.length)
      await audio.close()
      if(integrity?.problem||rms<.001)throw new Error('Imagem/áudio inválidos')
      setReport(JSON.stringify({status:'PASS',info,integrity,rms,bytes:saved.blob.size,edits:saved.edit.motion,versions:versions.length}))
    } catch(error){setReport(`FAIL ${String(error)}`)}
  }
  return <><aside className="border p-3"><button onClick={()=>void load()}>Carregar fonte de teste</button><button onClick={()=>void verify()} className="ml-4">Conferir exportação</button><p role="status">{report}</p></aside>{ready&&<VideoEditor/>}</>
}
createRoot(document.getElementById('root')!).render(<Harness/>)
