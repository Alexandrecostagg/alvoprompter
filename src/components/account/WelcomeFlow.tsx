import { useState } from 'react'
import BrandMark from '../BrandMark'
import AuthForm from './AuthForm'
import { PLANS, type PlanId } from '../../lib/plans'

type EntryStep = 'intro' | 'welcome' | 'signin' | 'signup'

const INTRO_SLIDES = [
  {
    eyebrow: 'Fale com naturalidade',
    title: 'Seu roteiro perto da câmera.',
    text: 'Leia sem desviar o olhar. O texto acompanha seu ritmo e mantém você conectado com quem está assistindo.',
    icon: '◎',
  },
  {
    eyebrow: 'Um fluxo, três passos',
    title: 'Roteiro, ajuste e gravação.',
    text: 'O AlvoPrompter guia cada etapa e mostra apenas as ferramentas que você precisa naquele momento.',
    icon: '↗',
  },
  {
    eyebrow: 'Privacidade por padrão',
    title: 'Comece sem conta. Entre quando quiser.',
    text: 'Sem conta, seus roteiros ficam apenas neste dispositivo. Com uma conta, você libera backup, equipe e assinatura.',
    icon: '◇',
  },
] as const

export default function WelcomeFlow({ requestedPlan, onContinueLocal }: { requestedPlan?: PlanId | null; onContinueLocal: () => void }) {
  const [step, setStep] = useState<EntryStep>(requestedPlan ? 'signup' : 'intro')
  const [recovering, setRecovering] = useState(false)
  const [introIndex, setIntroIndex] = useState(0)
  const openAuth = (next: EntryStep) => { setRecovering(false); setStep(next) }

  if (step === 'intro') {
    const slide = INTRO_SLIDES[introIndex]!
    const isLast = introIndex === INTRO_SLIDES.length - 1
    return (
      <main className="relative flex min-h-[100dvh] flex-col overflow-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="pointer-events-none absolute -left-28 top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--accent-2)' }} />
        <div className="pointer-events-none absolute -right-28 bottom-20 h-72 w-72 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--accent)' }} />

        <header className="relative mx-auto flex w-full max-w-md items-center justify-between">
          <BrandMark />
          <button onClick={() => setStep('welcome')} className="min-h-11 px-2 text-sm font-bold" style={{ color: 'var(--muted)' }}>Pular</button>
        </header>

        <section className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-[2rem] border text-5xl shadow-2xl" style={{ borderColor: 'var(--border)', background: 'linear-gradient(145deg, var(--accent-soft), var(--panel))', color: 'var(--brand-strong)', boxShadow: '0 24px 70px rgba(99,102,241,.18)' }} aria-hidden="true">{slide.icon}</div>
          <p className="mt-10 text-center text-xs font-bold uppercase tracking-[.18em]" style={{ color: 'var(--brand-strong)' }}>{slide.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-sm text-center text-3xl font-extrabold leading-tight tracking-[-.04em] sm:text-4xl">{slide.title}</h1>
          <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-relaxed sm:text-base" style={{ color: 'var(--muted)' }}>{slide.text}</p>

          {introIndex === 1 ? (
            <div className="mt-8 grid grid-cols-3 gap-2" aria-label="Fluxo em três etapas">
              {['1. Roteiro', '2. Ajuste', '3. Grave'].map((label) => <span key={label} className="rounded-2xl border px-2 py-3 text-center text-xs font-bold" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>{label}</span>)}
            </div>
          ) : null}
        </section>

        <footer className="relative mx-auto w-full max-w-md">
          <div className="mb-5 flex justify-center gap-2" aria-label={`Etapa ${introIndex + 1} de ${INTRO_SLIDES.length}`}>
            {INTRO_SLIDES.map((item, index) => <span key={item.title} className="h-1.5 rounded-full transition-all" style={{ width: index === introIndex ? '2rem' : '.5rem', background: index === introIndex ? 'var(--brand-strong)' : 'var(--border)' }} />)}
          </div>
          <button onClick={() => { if (isLast) setStep('welcome'); else setIntroIndex((value) => value + 1) }} className="min-h-14 w-full rounded-2xl text-base font-bold text-white shadow-lg" style={{ background: 'var(--brand-gradient)', boxShadow: '0 14px 32px rgba(99,102,241,.25)' }}>{isLast ? 'Começar agora' : 'Continuar'}</button>
        </footer>
      </main>
    )
  }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:grid lg:place-items-center" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="pointer-events-none absolute -left-28 top-12 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: '#8b5cf6' }} />
      <div className="pointer-events-none absolute -right-24 bottom-8 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: '#22d3ee' }} />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="flex min-h-12 items-center justify-between gap-3">
          <BrandMark />
          <span className="rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em]" style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--panel)' }}>Seu roteiro no alvo</span>
        </header>

        <section className="mt-6 grid overflow-hidden rounded-[2rem] border shadow-2xl lg:grid-cols-[1.05fr_.95fr]" style={{ borderColor: 'var(--border)', background: 'var(--panel)', boxShadow: '0 30px 90px rgba(15,23,42,.12)' }}>
          <div className={`welcome-story ${step !== 'welcome' ? 'hidden lg:flex' : 'flex'}`}>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: 'var(--brand-strong)' }}>Da sua ideia ao vídeo</p>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-.04em] sm:text-4xl">Sua mensagem.<br />Seu olhar na câmera.</h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>Prepare seu roteiro, acompanhe a leitura e grave com mais confiança.</p>
            </div>
            <div className="welcome-prompter" aria-label="Exemplo de leitura no teleprompter">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.18em] text-white/60"><span>Seu próximo vídeo</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />REC</span></div>
              <p className="mt-7 text-xl font-semibold leading-relaxed text-white/40">Toda boa história<br />começa com uma ideia.</p>
              <p className="my-3 border-l-2 border-cyan-300 pl-4 text-2xl font-bold leading-relaxed text-white on-dark">A próxima pode<br />ser a sua.</p>
              <div className="mt-7 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-white/60"><span>Roteiro pronto. Agora é com você.</span><span aria-hidden="true">▶</span></div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Roteiro · Teleprompter · Gravação</p>
          </div>

          <div className="order-1 flex min-h-[470px] flex-col justify-center p-6 sm:p-9 lg:order-2 lg:p-9">
            {step === 'welcome' ? (
              <div className="mx-auto w-full max-w-sm">
                <p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: 'var(--brand-strong)' }}>Primeiro acesso</p>
                <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Como você quer começar?</h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>Uma conta permite sincronizar, assinar um plano e usar o AlvoPrompter em mais de um aparelho.</p>

                <button onClick={() => openAuth('signup')} className="mt-7 min-h-14 w-full rounded-2xl text-base font-bold text-white shadow-lg" style={{ background: 'var(--brand-gradient)', boxShadow: '0 14px 30px rgba(99,102,241,.24)' }}>Criar conta grátis</button>
                <button onClick={() => openAuth('signin')} className="mt-3 min-h-13 w-full rounded-2xl border text-sm font-bold" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>Já tenho uma conta</button>

                <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.12em]" style={{ color: 'var(--muted)' }}><span className="h-px flex-1" style={{ background: 'var(--border)' }} />ou<span className="h-px flex-1" style={{ background: 'var(--border)' }} /></div>

                <button onClick={onContinueLocal} className="min-h-11 w-full text-sm font-bold" style={{ color: 'var(--brand-strong)' }}>Continuar sem conta</button>
                <p className="mt-2 text-center text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Seus arquivos ficam só neste dispositivo, sem backup na nuvem.</p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-sm">
                {!recovering && <>
                  <p className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: 'var(--brand-strong)' }}>{step === 'signup' ? 'Conta gratuita' : 'Boas-vindas de volta'}</p>
                  <h2 className="mt-2 text-2xl font-extrabold">{step === 'signup' ? 'Crie sua conta' : 'Acesse sua conta'}</h2>
                </>}
                {requestedPlan ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--brand-strong)' }}>Plano escolhido: {PLANS[requestedPlan].name}</p> : null}
                <div className="mt-5"><AuthForm mode={step} onModeChange={setStep} onRecoveryChange={setRecovering} /></div>
                <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={onContinueLocal} className="auth-link w-full text-center">Usar sem conta</button>
                  <p className="mt-1 text-center text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>Roteiros e vídeos apenas neste dispositivo.<br />Sem sincronização ou backup na nuvem.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
