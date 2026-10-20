import { createRoot } from 'react-dom/client'
import AdminAccessPanel from '../src/components/account/AdminAccessPanel'
import type { accountFetch } from '../src/lib/saas'
import '../src/index.css'
const people = [
  { id:'preview-ana',name:'Ana · Validação',email:'ana@example.test',requestedPlan:'studio',requestStatus:'pending',grantPlan:null,grantStatus:null,expiresAt:null,revision:null,timerStatus:null,paidPlan:null,provider:null,paidStatus:null,paidUntil:null },
  { id:'preview-bruno',name:'Bruno · Validação',email:'bruno@example.test',requestedPlan:'creator',requestStatus:'approved',grantPlan:'creator',grantStatus:'active',expiresAt:new Date(Date.now()+2*86400000).toISOString(),revision:'preview-1',timerStatus:'scheduled',paidPlan:null,provider:null,paidStatus:null,paidUntil:null },
]
const events=[{id:'preview-notification',userId:'preview-bruno',title:'Acesso temporário perto do fim',body:'Bruno · Validação (bruno@example.test): Criador termina em 2 dias. Revise no painel. Nenhuma cobrança foi iniciada.',kind:'expiring',readAt:null as string|null,emailStatus:'sent',createdAt:new Date().toISOString()}]
const history: {action:string;reason:string;email:string;createdAt:string}[]=[]
const transport: typeof accountFetch = async <T,>(path:string,init:RequestInit={}):Promise<T> => {
  if(path.startsWith('/admin/overview')) {const q=new URL('https://preview.test'+path).searchParams.get('q')??'';return JSON.parse(JSON.stringify({users:people.filter(u=>(u.name+' '+u.email).toLowerCase().includes(q.toLowerCase())),nextCursor:null,unread:events.filter(e=>!e.readAt).length,emailConfigured:true,timersConfigured:true,notifications:events,audit:history})) as T}
  if(path==='/admin/billing-status') return {configured:true,sandbox:true,credentialAccepted:true,providerStatus:'APPROVED',pendingEvents:0,failedCheckouts:0} as T
  if(path==='/admin/email-test') return {ok:true} as T
  if(path.endsWith('/read')) {events[0].readAt=new Date().toISOString();return {ok:true} as T}
  const user=people.find(u=>path.includes(u.id));if(!user)throw Error('Usuário não encontrado')
  const body=JSON.parse(String(init.body));if(body.expectedRevision!==user.revision)throw Error('Outro administrador alterou este acesso. Atualize antes de salvar.')
  user.grantPlan=body.plan;user.grantStatus=body.action==='grant'?'active':'revoked';user.expiresAt=body.expiresAt??user.expiresAt;user.revision=crypto.randomUUID();user.timerStatus='scheduled';user.requestStatus=body.action==='grant'?'approved':body.action==='checkout'?'checkout_required':'declined'
  history.unshift({action:body.action,reason:body.reason,email:user.email,createdAt:new Date().toISOString()})
  return {ok:true,warning:null} as T
}
export function AdminPreview(){ return <main className="mx-auto max-w-5xl p-3 sm:p-6"><p className="rounded-xl border p-3 text-sm font-semibold">Validação local · Dados fictícios · Não altera produção nem envia cobranças</p><AdminAccessPanel request={transport}/></main> }
createRoot(document.getElementById('root')!).render(<AdminPreview/> )
