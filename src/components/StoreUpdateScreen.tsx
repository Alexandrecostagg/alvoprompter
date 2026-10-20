import { STORE_URLS, type AppPolicy } from '../lib/appPolicy'

export default function StoreUpdateScreen({ policy, info, busy, error, onCheck }: { policy: AppPolicy; info: { version: string; build: string }; busy: boolean; error: string; onCheck: () => void }) {
  return <main className="fixed inset-0 z-[99999] flex flex-col overflow-y-auto px-6" style={{ background: 'var(--bg)', color: 'var(--text)', paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
    <section className="mx-auto my-auto w-full max-w-md shrink-0 space-y-5 py-6" aria-labelledby="update-title">
      <p className="text-sm font-semibold" style={{ color: 'var(--brand-strong)' }}>ALVOPROMPTER</p>
      <h1 id="update-title" className="text-3xl font-bold">Atualize para continuar</h1>
      <p className="leading-relaxed">A versão {policy.version} já está disponível. Instale a atualização para continuar usando o app.</p>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Seus roteiros e vídeos salvos neste aparelho serão preservados. Atualize pela loja; não desinstale o app.</p>
      <a className="flex min-h-12 items-center justify-center rounded-xl px-4 font-bold text-white" style={{ background: 'var(--brand-gradient)' }} href={STORE_URLS[policy.platform]} target="_blank" rel="noopener noreferrer">Atualizar na {policy.platform === 'ios' ? 'App Store' : 'Google Play'}</a>
      <button className="min-h-12 w-full rounded-xl border px-4 font-semibold disabled:opacity-50" onClick={onCheck} disabled={busy}>{busy ? 'Verificando…' : 'Já atualizei · verificar novamente'}</button>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Versão instalada: {info.version} ({info.build})</p>
    </section>
  </main>
}
