import { useState } from 'react'
import BrandMark from '../BrandMark'
import CreatorVisual from '../CreatorVisual'
import AuthForm from './AuthForm'
import { PLANS, type PlanId } from '../../lib/plans'

type EntryStep = 'intro' | 'signin' | 'signup'
const INTRO_SLIDES = [
  { eyebrow: 'SUA IDEIA. SUA VOZ.', title: 'Mais confiança.\nDo primeiro take ao vídeo.', text: 'Transforme uma ideia em roteiro e grave olhando para a câmera, sem decorar cada palavra.', caption: 'Sua história merece ser contada.', benefit: 'Roteiro, teleprompter e gravação em um só lugar.' },
  { eyebrow: 'MENOS BLOQUEIO. MAIS CRIAÇÃO.', title: 'A ideia é sua.\nO primeiro rascunho, da IA.', text: 'Conte o tema, encontre as palavras e ajuste o texto até ficar com a sua cara.', caption: 'Toda boa história começa com uma ideia.', benefit: 'Gere, revise e ensaie antes de gravar.' },
  { eyebrow: 'NO SEU RITMO.', title: 'Olhe para a câmera.\nAcompanhe sua mensagem.', text: 'Ajuste a leitura do teleprompter e grave com mais naturalidade. Seu próximo vídeo começa aqui.', caption: 'Agora é a sua vez de dar o play.', benefit: 'Comece no aparelho. Crie uma conta quando quiser.' },
] as const

export default function WelcomeFlow({ requestedPlan, onContinueLocal }: { requestedPlan?: PlanId | null; onContinueLocal: () => void }) {
  const [step, setStep] = useState<EntryStep>(requestedPlan ? 'signup' : 'intro')
  const [recovering, setRecovering] = useState(false)
  const [introIndex, setIntroIndex] = useState(0)
  const slide = INTRO_SLIDES[introIndex]!
  const openAuth = (next: EntryStep) => { setRecovering(false); setStep(next) }

  return (
    <main className={`entry-page ${step !== 'intro' ? 'entry-auth' : ''}`}>
      <header className="entry-header">
        <BrandMark />
        {step === 'intro'
          ? <button onClick={() => openAuth('signin')} className="entry-header-link">Entrar <span aria-hidden="true">↗</span></button>
          : <button onClick={() => openAuth('intro')} className="entry-header-link">← Voltar</button>}
      </header>
      <section className="entry-layout">
        <div className="entry-art"><CreatorVisual caption={slide.caption} /><span className="entry-art-note">Do seu jeito. Com a sua voz.</span></div>
        {step === 'intro' ? (
          <div className="entry-content">
            <div className="entry-slide" aria-live="polite" aria-atomic="true">
              <p className="studio-eyebrow">{slide.eyebrow}</p>
              <h1>{slide.title}</h1>
              <p className="entry-description">{slide.text}</p>
              <p className="entry-benefit"><span aria-hidden="true">✓</span>{slide.benefit}</p>
            </div>
            <div className="entry-pagination" aria-label="Apresentação do app">
              {INTRO_SLIDES.map((item, index) => <button key={item.eyebrow} onClick={() => setIntroIndex(index)} aria-label={`Ver apresentação ${index + 1}: ${item.eyebrow}`} aria-pressed={index === introIndex}><span /></button>)}
              <button className="entry-next" onClick={() => setIntroIndex((value) => (value + 1) % INTRO_SLIDES.length)} aria-label="Próxima apresentação">→</button>
            </div>
            <button onClick={() => openAuth('signup')} className="studio-primary">Começar grátis <span aria-hidden="true">→</span></button>
            <button onClick={onContinueLocal} className="entry-local">Explorar sem conta</button>
            <p className="entry-footnote">Sem conta, os roteiros ficam só neste aparelho.</p>
          </div>
        ) : (
          <div className="entry-content entry-form">
            {!recovering && <><p className="studio-eyebrow">{step === 'signup' ? 'SEU PRÓXIMO VÍDEO COMEÇA AQUI' : 'BOM TER VOCÊ DE VOLTA'}</p><h1>{step === 'signup' ? 'Vamos criar juntos.' : 'Seu estúdio está aqui.'}</h1><p className="entry-description">{step === 'signup' ? 'Crie sua conta gratuita para começar.' : 'Entre para continuar de onde parou.'}</p></>}
            {requestedPlan && <p className="entry-plan">Plano escolhido: {PLANS[requestedPlan].name}</p>}
            <div className="mt-5"><AuthForm mode={step} onModeChange={setStep} onRecoveryChange={setRecovering} /></div>
            <button onClick={onContinueLocal} className="entry-local">Continuar sem conta</button>
            <p className="entry-footnote">Roteiros neste aparelho, sem backup na nuvem.</p>
          </div>
        )}
      </section>
    </main>
  )
}
