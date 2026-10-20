import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import NativeUpdateGate, { type UpdateRuntime } from '../src/components/NativeUpdateGate'
import { useAppStore } from '../src/store/useAppStore'
import '../src/index.css'

let build = '22', minimumBuild = 0, revision = 0, offline = false, foreground: (() => void) | null = null
const cache = new Map<string, string>()
const runtime: UpdateRuntime = {
  platform: () => 'ios', native: () => true,
  getInfo: async () => ({ version: build === '22' ? '1.6.4' : '1.6.5', build }),
  onForeground: async callback => { foreground = callback; return { remove: async () => { if (foreground === callback) foreground = null } } },
  readPolicy: async () => { if (offline) throw Error('offline'); return { platform: 'ios', minimumBuild, version: '1.6.5', revision } },
  storage: () => ({ getItem: key => cache.get(key) ?? null, setItem: (key, value) => { cache.set(key, value) } }),
}
export function LifecyclePreview() {
  const [session, setSession] = useState(0)
  return <><aside style={{ zIndex: 100000 }} className="fixed inset-x-0 top-0 z-[100000] flex flex-wrap gap-1 border bg-white p-2 text-xs text-black" aria-label="Controles de simulação local">
    <p className="w-full">Simulação local do ciclo nativo · Não altera produção</p>
    <button className="min-h-11 border px-2" onClick={() => useAppStore.getState().setView('prompter')}>Iniciar tomada simulada</button>
    <button className="min-h-11 border px-2" onClick={() => { minimumBuild = 23; revision++; foreground?.() }}>Liberar build 23 simulado</button>
    <button className="min-h-11 border px-2" onClick={() => useAppStore.getState().setView('library')}>Terminar tomada simulada</button>
    <button className="min-h-11 border px-2" onClick={() => { build = '23'; foreground?.() }}>Instalar build 23 simulado</button>
    <button className="min-h-11 border px-2" onClick={() => { offline = true; build = '22'; setSession(s => s + 1) }}>Reabrir build 22 offline</button>
    <button className="min-h-11 border px-2" onClick={() => { offline = false; minimumBuild = 0; revision++; foreground?.() }}>Suspender exigência online</button>
  </aside><NativeUpdateGate key={session} runtime={runtime}><main className="grid min-h-dvh place-items-center p-6"><h1>App disponível · Simulação local</h1></main></NativeUpdateGate></>
}
createRoot(document.getElementById('root')!).render(<LifecyclePreview />)
