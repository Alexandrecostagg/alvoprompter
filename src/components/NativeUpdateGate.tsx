import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { apiBase } from '../lib/cloudflare'
import { updateRequired, type AppPolicy, type StorePlatform } from '../lib/appPolicy'
import { acceptStorePolicy, cachedStorePolicy } from '../lib/storePolicyCache'
import { useAppStore } from '../store/useAppStore'
import StoreUpdateScreen from './StoreUpdateScreen'

export interface UpdateRuntime {
  platform: () => string
  native: () => boolean
  getInfo: () => Promise<{ version: string; build: string }>
  onForeground: (check: () => void) => Promise<{ remove: () => Promise<void> }>
  readPolicy: (platform: string) => Promise<unknown>
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
}
const nativeRuntime: UpdateRuntime = {
  platform: () => Capacitor.getPlatform(), native: () => Capacitor.isNativePlatform(), getInfo: () => App.getInfo(),
  onForeground: check => App.addListener('appStateChange', ({ isActive }) => { if (isActive) check() }),
  storage: () => localStorage,
  readPolicy: async platform => {
    const response = await fetch(`${apiBase()}/app-policy?platform=${platform}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('policy-unavailable')
    return response.json()
  },
}
export default function NativeUpdateGate({ children, runtime = nativeRuntime }: { children: ReactNode; runtime?: UpdateRuntime }) {
  const platform = runtime.platform()
  const native = runtime.native() && (platform === 'ios' || platform === 'android')
  const [ready, setReady] = useState(!native), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [info, setInfo] = useState({ version: '', build: '' }), [policy, setPolicy] = useState<AppPolicy | null>(null)
  const flight = useRef(false), firstCheck = useRef(true), active = useRef(false)
  const knownRequired = useRef(false), currentPolicy = useRef<AppPolicy | null>(null)
  const [deferred, setDeferred] = useState(false)
  const view = useAppStore(s => s.view)
  const check = useCallback(async () => {
    if (!native || flight.current) return
    flight.current = true; setBusy(true); setError('')
    try {
      let timeout: number | undefined
      const current = await Promise.race([
        runtime.getInfo(),
        new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('native-info-timeout')), 8000) }),
      ]).finally(() => window.clearTimeout(timeout))
      if (!active.current) return
      setInfo({ version: current.version, build: current.build })
      const apply = (next: AppPolicy) => {
        const required = updateRequired(next, current.build)
        const currentView = useAppStore.getState().view
        // Defer only a newly discovered requirement during a take/export.
        // Rechecking an already blocked app must never grant a bypass.
        if (required && !knownRequired.current && !firstCheck.current && (currentView === 'prompter' || currentView === 'video-editor')) setDeferred(true)
        if (!required) setDeferred(false)
        knownRequired.current = required; currentPolicy.current = next; setPolicy(next)
      }
      let cached: AppPolicy | null = currentPolicy.current
      try {
        const disk = cachedStorePolicy(platform as StorePlatform, runtime.storage())
        if (disk && (!cached || disk.revision >= cached.revision)) cached = disk
      } catch { /* Storage is unavailable. */ }
      if (cached) apply(cached)
      const value: unknown = await runtime.readPolicy(platform)
      if (!active.current) return
      // A stale intermediary response must not undo a newer policy or rollback.
      const next = acceptStorePolicy(value, platform as StorePlatform, { getItem: key => runtime.storage().getItem(key), setItem: (key, data) => runtime.storage().setItem(key, data) }, cached)
      apply(next)
    } catch {
      if (active.current) setError('Não foi possível consultar a loja. Verifique a conexão e tente novamente.')
    } finally {
      flight.current = false
      if (active.current) { firstCheck.current = false; setReady(true); setBusy(false) }
    }
  }, [native, platform, runtime])
  useEffect(() => {
    if (!native) return
    active.current = true
    void check()
    const foreground = runtime.onForeground(() => void check())
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, 300_000)
    return () => { active.current = false; window.clearInterval(timer); void foreground.then(h => h.remove()) }
  }, [check, native, runtime])
  const criticalScreen = view === 'prompter' || view === 'video-editor'
  useEffect(() => { if (!criticalScreen) setDeferred(false) }, [criticalScreen])
  if (!native) return children
  const blocked = ready && updateRequired(policy, info.build) && !(deferred && criticalScreen)
  if (!ready) return <main className="grid min-h-dvh place-items-center p-6" role="status">Verificando versão do app…</main>
  return <>
    <div style={{ height: '100%' }} inert={blocked || undefined} aria-hidden={blocked || undefined}>{children}</div>
    {blocked && policy ? <StoreUpdateScreen policy={policy} info={info} busy={busy} error={error} onCheck={() => void check()} /> : null}
  </>
}
