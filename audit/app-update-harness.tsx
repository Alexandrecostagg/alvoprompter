import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import AdminAppPolicy from '../src/components/account/AdminAppPolicy'
import StoreUpdateScreen from '../src/components/StoreUpdateScreen'
import type { AppPolicy } from '../src/lib/appPolicy'
import type { accountFetch } from '../src/lib/saas'
import '../src/index.css'

const policies: AppPolicy[] = ['ios', 'android'].map(p => ({ platform: p as AppPolicy['platform'], minimumBuild: 0, version: '1.6.4', revision: 0 }))
const request: typeof accountFetch = async <T,>(_path: string, init: RequestInit = {}): Promise<T> => {
  if (init.method === 'PUT') {
    const body = JSON.parse(String(init.body)), policy = policies.find(p => p.platform === body.platform)!
    if (policy.revision !== body.expectedRevision) throw Error('Configuração mudou. Recarregue.')
    Object.assign(policy, { minimumBuild: body.minimumBuild, version: body.version, revision: policy.revision + 1 })
    return { ...policy } as T
  }
  return { policies: policies.map(p => ({ ...p })) } as T
}
export function Preview() {
  const [show, setShow] = useState(false), [error, setError] = useState('')
  if (show) return <StoreUpdateScreen policy={{ platform: 'ios', minimumBuild: 23, version: '1.6.5', revision: 1 }} info={{ version: '1.6.4', build: '22' }} busy={false} error={error} onCheck={() => setError('Verificação simulada: o build instalado ainda é 22. O acesso continua bloqueado.')} />
  return <main className="mx-auto max-w-2xl space-y-5 p-6"><p>Validação local · Dados fictícios · Nenhuma regra de produção será alterada</p><AdminAppPolicy request={request} /><button className="min-h-12 rounded-xl border px-4" onClick={() => setShow(true)}>Prévia da tela de atualização</button></main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
