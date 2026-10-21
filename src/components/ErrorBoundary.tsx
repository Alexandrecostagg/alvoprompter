import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Falha inesperada na interface', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="grid min-h-full place-items-center p-6" style={{ background: 'var(--bg)' }}>
        <section className="w-full max-w-md rounded-3xl border p-6 text-center shadow-xl" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <p className="mx-auto grid h-12 w-12 place-items-center rounded-2xl text-xl" style={{ background: 'var(--accent-soft)' }}>
            ↻
          </p>
          <h1 className="mt-4 text-xl font-bold">Não conseguimos abrir esta tela</h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            Seus roteiros continuam salvos neste dispositivo. Recarregue o aplicativo para tentar novamente.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 min-h-11 rounded-xl px-5 text-sm font-bold text-white"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Recarregar aplicativo
          </button>
        </section>
      </main>
    )
  }
}
