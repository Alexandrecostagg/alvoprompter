import { createRoot } from 'react-dom/client'
import { useMemo, useState } from 'react'
import DeleteAccountPanel from '../src/components/account/DeleteAccountPanel'
import type { User } from '../src/lib/auth'
import type { accountFetch } from '../src/lib/saas'
import '../src/index.css'

export function Preview() {
  const [apple,setApple]=useState(false),[event,setEvent]=useState('Nenhuma solicitação de exclusão enviada.'),[generation,setGeneration]=useState(0)
  const dependencies=useMemo(()=>{
    const simulatedId=`simulated-${generation}`
    let status:'pending'|'complete'|null=null
    const request:typeof accountFetch=async<T,>(_path:string,init:RequestInit={}):Promise<T>=>{
      if(init.method==='DELETE') {status='pending';setEvent('Simulação: pedido registrado após confirmar a identidade.');return {id:simulatedId,status} as T}
      return {configured:true,appleSubscription:apple,workspaces:[{id:'test-team',name:'Equipe de demonstração'}],localWorkspaceIds:['test-team'],deletion:status?{id:simulatedId,status}:null} as T
    }
    return {request,reauthenticate:async()=>{setEvent('Simulação: identidade confirmada.')},cleanup:async(uid:string)=>{setEvent(`Simulação: limpeza local apenas para ${uid}.`)} }
  },[apple,generation])
  const user={uid:'demonstracao',email:'demonstracao@example.test',providerData:[{providerId:apple?'apple.com':'password'}]} as User
  return <main className="mx-auto max-w-xl space-y-4 p-4 pb-12">
    <p className="rounded-xl border p-3 font-semibold">Validação local · Conta fictícia · Nenhuma conta ou cobrança real é alterada.</p>
    <h1 className="text-2xl font-bold">Conta e assinatura</h1>
    <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl border px-3" onClick={()=>{setApple(v=>!v);setGeneration(v=>v+1)}}>Simular {apple?'senha':'assinatura Apple'}</button><button className="min-h-11 rounded-xl border px-3" onClick={()=>{setGeneration(v=>v+1);setEvent('Simulação reiniciada.')}}>Reiniciar simulação</button></div>
    <DeleteAccountPanel key={`${apple}-${generation}`} user={user} onComplete={()=>undefined} {...dependencies}/>
    <p role="status" className="rounded-xl border p-3">{event}</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
