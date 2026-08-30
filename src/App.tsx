import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useAppStore } from './store/useAppStore'
import type { View } from './lib/types'
import BrandMark from './components/BrandMark'
import SyncControl from './components/SyncControl'
import type { PlanId } from './lib/plans'
import { observeUser, type User } from './lib/auth'
import { initializeMetaPixel } from './lib/metaPixel'

const ScriptLibrary = lazy(() => import('./components/library/ScriptLibrary'))
const ScriptEditor = lazy(() => import('./components/editor/ScriptEditor'))
const PrompterView = lazy(() => import('./components/prompter/PrompterView'))
const VideoEditor = lazy(() => import('./components/editor/VideoEditor'))
const ControlRoom = lazy(() => import('./components/control/ControlRoom'))
const SchedulingHub = lazy(() => import('./components/scheduling/SchedulingHub'))
const WorkspacesPanel = lazy(() => import('./components/workspace/WorkspacesPanel'))
const AiTwin = lazy(() => import('./components/aiTwin/AiTwin'))
const VideoPageView = lazy(() => import('./components/video/VideoPageView'))
const MetricsPanel = lazy(() => import('./components/metrics/MetricsPanel'))
const AccountPanel = lazy(() => import('./components/account/AccountPanel'))
const WelcomeFlow = lazy(() => import('./components/account/WelcomeFlow'))

// A chave versionada faz o novo onboarding aparecer uma vez também para quem atualizar o app.
const LOCAL_ACCESS_KEY = 'alvoprompter-local-access-v2'

type IconName = 'scripts' | 'edit' | 'record' | 'calendar' | 'more' | 'control' | 'team' | 'twin' | 'theme' | 'account' | 'chart'

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    scripts: <><path d="M7 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M9 9h6M9 13h6M9 17h4" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
    record: <><rect x="3" y="5" width="18" height="14" rx="4" /><circle cx="12" cy="12" r="3" /><path d="M8 2h8" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 17h3" /></>,
    more: <><rect x="4" y="4" width="6" height="6" rx="2" /><rect x="14" y="4" width="6" height="6" rx="2" /><rect x="4" y="14" width="6" height="6" rx="2" /><rect x="14" y="14" width="6" height="6" rx="2" /></>,
    control: <><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 21h8M12 17v4M8 10h3M9.5 8.5v3M15.5 9.5h.01M18 12h.01" /></>,
    team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    twin: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM18 13l1 2.8 3 1.2-3 1.2L18 21l-1-2.8-3-1.2 3-1.2 1-2.8Z" /></>,
    theme: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" />,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    chart: <><path d="M4 20h16M6 16v-4M10 16V8M14 16v-6M18 16v-2" /></>,
  }
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('alvoprompt-theme')
    return saved === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('alvoprompt-theme', theme)
  }, [theme])

  return { theme, toggleTheme: () => setTheme((value) => (value === 'light' ? 'dark' : 'light')) }
}

function LoadingView() {
  return (
    <div className="grid min-h-64 place-items-center" aria-label="Carregando tela">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-current" style={{ color: 'var(--accent)' }} />
    </div>
  )
}

function DesktopNavButton({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="min-h-10 rounded-xl px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35" style={{ color: active ? 'var(--brand-strong)' : 'var(--muted)', background: active ? 'var(--accent-soft)' : 'transparent' }}>
      {children}
    </button>
  )
}

function UserAvatar({ name, email, size = 34 }: { name?: string | null; email?: string | null; size?: number }) {
  const source = (name || email || '?').trim()
  const initials = source
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('pt-BR')
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg, #ffb829, #ff7a59)', boxShadow: '0 3px 10px rgba(255,122,89,.35)' }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  )
}

function MobileNavButton({ active, disabled, icon, label, primary, onClick }: { active?: boolean; disabled?: boolean; icon: IconName; label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-current={active ? 'page' : undefined} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition disabled:opacity-35 ${primary ? '-mt-5' : ''}`} style={{ color: active || primary ? 'var(--brand-strong)' : 'var(--muted)' }}>
      <span className={`grid place-items-center ${primary ? 'h-12 w-12 rounded-2xl text-white shadow-lg' : 'h-7 w-9 rounded-xl'} ${active && !primary ? 'shadow-sm' : ''}`} style={primary ? { background: 'var(--brand-gradient)', boxShadow: '0 10px 25px rgba(99,102,241,.32)' } : active ? { background: 'var(--accent-soft)', color: 'var(--brand-strong)' } : undefined}>
        <Icon name={icon} className={primary ? 'h-6 w-6' : 'h-5 w-5'} />
      </span>
      <span>{label}</span>
      {active && !primary ? <span className="absolute bottom-0 h-1 w-5 rounded-full" style={{ background: 'var(--brand-gradient)' }} /> : null}
    </button>
  )
}

export default function App() {
  const view = useAppStore((state) => state.view)
  const currentScript = useAppStore((state) => state.currentScript)
  const setView = useAppStore((state) => state.setView)
  const selectScript = useAppStore((state) => state.selectScript)
  const { theme, toggleTheme } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [localAccess, setLocalAccess] = useState(() => localStorage.getItem(LOCAL_ACCESS_KEY) === 'enabled')
  const [requestedPlan] = useState<PlanId | null>(() => {
    const value = new URLSearchParams(window.location.search).get('plan')
    return value === 'creator' || value === 'studio' ? value : null
  })

  useEffect(() => {
    initializeMetaPixel()
    void Promise.allSettled([
      useAppStore.getState().loadScripts(),
      useAppStore.getState().refreshWorkspaces(),
    ])
  }, [])

  useEffect(() => {
    // O Firebase pode demorar indefinidamente em WebViews sem rede. O app local
    // continua utilizável e o observador atualiza a sessão quando responder.
    const fallback = window.setTimeout(() => setAuthReady(true), 5000)
    const unsubscribe = observeUser((nextUser) => {
      window.clearTimeout(fallback)
      setUser(nextUser)
      setAuthReady(true)
      if (nextUser) {
        localStorage.removeItem(LOCAL_ACCESS_KEY)
        setLocalAccess(false)
      }
    })
    return () => {
      window.clearTimeout(fallback)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (requestedPlan) setAccountOpen(true)
  }, [requestedPlan])

  const navigate = (next: View) => {
    setMoreOpen(false)
    setView(next)
  }

  useEffect(() => {
    const videoId = new URLSearchParams(window.location.search).get('v')
    if (videoId) setView('video-page')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openPrompterFlow = () => {
    if (currentScript?.content.trim()) {
      navigate('prompter')
      return
    }
    if (!currentScript) {
      const now = Date.now()
      selectScript({ title: 'Novo roteiro', content: '', createdAt: now, updatedAt: now })
    }
    navigate('editor')
  }

  const continueLocally = () => {
    localStorage.setItem(LOCAL_ACCESS_KEY, 'enabled')
    setLocalAccess(true)
  }

  if (!authReady) {
    return <div className="grid min-h-[100dvh] place-items-center" style={{ background: 'var(--bg)' }}><LoadingView /></div>
  }

  if (!user && !localAccess) {
    return <Suspense fallback={<LoadingView />}><WelcomeFlow requestedPlan={requestedPlan} onContinueLocal={continueLocally} /></Suspense>
  }

  if (view === 'prompter' || view === 'video-editor' || view === 'control') {
    return (
      <Suspense fallback={<LoadingView />}>
        {view === 'prompter' ? <PrompterView /> : null}
        {view === 'video-editor' ? <VideoEditor /> : null}
        {view === 'control' ? <ControlRoom /> : null}
      </Suspense>
    )
  }

  const moreActive = view === 'workspaces' || view === 'ai-twin'

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b px-4 pb-2.5 pt-2.5 backdrop-blur-xl lg:hidden" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--panel) 90%, transparent)', paddingTop: 'max(.625rem, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('library')} aria-label="Ir para meus roteiros"><BrandMark compact /></button>
        <div className="flex items-center gap-2">
          <button onClick={() => setAccountOpen(true)} aria-label="Abrir conta e planos" className="grid h-11 w-11 place-items-center rounded-2xl border transition hover:shadow-sm" style={{ borderColor: 'var(--border)' }}>
            <UserAvatar name={user?.displayName} email={user?.email} size={30} />
          </button>
          <button onClick={() => setMoreOpen(true)} className="grid h-11 w-11 place-items-center rounded-2xl border" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} aria-label="Abrir menu"><Icon name="more" /></button>
        </div>
      </header>

      <header className="hidden min-h-16 items-center justify-between border-b px-6 lg:flex" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <button onClick={() => navigate('library')} aria-label="Ir para meus roteiros"><BrandMark /></button>
        <nav className="flex items-center gap-1" aria-label="Navegação principal">
          <DesktopNavButton active={view === 'library'} onClick={() => navigate('library')}>Roteiros</DesktopNavButton>
          <DesktopNavButton active={view === 'editor'} disabled={!currentScript} onClick={() => navigate('editor')}>Editor</DesktopNavButton>
          <DesktopNavButton onClick={() => navigate('control')}>Control Room</DesktopNavButton>
          <DesktopNavButton active={view === 'scheduling'} onClick={() => navigate('scheduling')}>Agenda</DesktopNavButton>
          <DesktopNavButton active={view === 'metrics'} onClick={() => navigate('metrics')}>Métricas</DesktopNavButton>
          <DesktopNavButton active={view === 'workspaces'} onClick={() => navigate('workspaces')}>Equipe</DesktopNavButton>
          <DesktopNavButton active={view === 'ai-twin'} onClick={() => navigate('ai-twin')}>Avatar IA</DesktopNavButton>
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={() => setAccountOpen(true)} className="flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}><UserAvatar name={user?.displayName} email={user?.email} size={24} /><span className="hidden sm:inline">Conta</span></button>
          <button onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-xl border" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}><Icon name="theme" /></button>
          <SyncControl />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Suspense fallback={<LoadingView />}>
          {view === 'library' ? <ScriptLibrary /> : null}
          {view === 'editor' ? <ScriptEditor /> : null}
          {view === 'scheduling' ? <SchedulingHub /> : null}
          {view === 'workspaces' ? <WorkspacesPanel /> : null}
          {view === 'ai-twin' ? <AiTwin /> : null}
          {view === 'metrics' ? <MetricsPanel /> : null}
          {view === 'video-page' ? <VideoPageView /> : null}
        </Suspense>
      </main>

      {moreOpen ? (
        <>
          <button className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)} aria-label="Fechar menu" />
          <section className="fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-50 rounded-t-[2rem] border p-4 pb-5 shadow-2xl lg:hidden" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }} role="dialog" aria-modal="true" aria-label="Mais ferramentas">
            <span className="mx-auto mb-3 block h-1 w-12 rounded-full" style={{ background: 'var(--border)' }} aria-hidden="true" />
            <div className="mb-3 flex items-center justify-between">
              <div><p className="font-bold">Mais ferramentas</p><p className="text-xs" style={{ color: 'var(--muted)' }}>Produção, equipe e preferências</p></div>
              <button onClick={() => setMoreOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--bg)', color: 'var(--muted)' }} aria-label="Fechar">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([['control', 'Control Room', 'control'], ['chart', 'Métricas', 'metrics'], ['team', 'Equipe', 'workspaces'], ['twin', 'Avatar IA', 'ai-twin']] as const).map(([icon, label, target]) => (
                <button key={target} onClick={() => navigate(target)} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-xs font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                  <Icon name={icon} className="h-6 w-6" />{label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <button onClick={toggleTheme} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold" style={{ background: 'var(--bg)', color: 'var(--text)' }}><Icon name="theme" />{theme === 'light' ? 'Modo escuro' : 'Modo claro'}</button>
              <SyncControl />
            </div>
          </section>
        </>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t px-2 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--panel) 96%, transparent)', boxShadow: '0 -12px 30px rgba(15,23,42,.08)' }} aria-label="Navegação principal">
        <MobileNavButton icon="scripts" label="Roteiros" active={view === 'library'} onClick={() => navigate('library')} />
        <MobileNavButton icon="edit" label="Editor" active={view === 'editor'} disabled={!currentScript} onClick={() => navigate('editor')} />
        <MobileNavButton icon="record" label="Prompter" primary onClick={openPrompterFlow} />
        <MobileNavButton icon="calendar" label="Agenda" active={view === 'scheduling'} onClick={() => navigate('scheduling')} />
        <MobileNavButton icon="more" label="Mais" active={moreActive} onClick={() => setMoreOpen(true)} />
      </nav>
      <Suspense fallback={null}><AccountPanel open={accountOpen} initialPlan={requestedPlan} onClose={() => setAccountOpen(false)} /></Suspense>
    </div>
  )
}
