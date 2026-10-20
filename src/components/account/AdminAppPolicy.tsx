import { useState } from 'react'
import { accountFetch } from '../../lib/saas'
import { STORE_URLS, type AppPolicy, type StorePlatform } from '../../lib/appPolicy'

export default function AdminAppPolicy({ request = accountFetch }: { request?: typeof accountFetch }) {
  const [policies, setPolicies] = useState<AppPolicy[] | null>(null)
  const [platform, setPlatform] = useState<StorePlatform>('ios'), [build, setBuild] = useState('0'), [version, setVersion] = useState('1.6.4')
  const [confirmed, setConfirmed] = useState(false), [review, setReview] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const field = 'mt-1 min-h-11 w-full rounded-xl border px-3 py-2'
  function choose(p: StorePlatform, list = policies) {
    const policy = list?.find(item => item.platform === p)
    setPlatform(p); setBuild(String(policy?.minimumBuild ?? 0)); setVersion(policy?.version ?? '1.6.4'); setConfirmed(false); setReview(false)
  }
  async function load() {
    setBusy(true); setMessage('')
    try { const data = await request<{ policies: AppPolicy[] }>('/admin/app-policy'); setPolicies(data.policies); choose(platform, data.policies) }
    catch (e) { setMessage((e as Error).message) } finally { setBusy(false) }
  }
  return <details className="rounded-xl border p-4" onToggle={e => { if (e.currentTarget.open && !policies && !busy) void load() }}>
    <summary className="cursor-pointer font-semibold">Atualização obrigatória nas lojas</summary>
    <p className="mt-3 text-sm leading-relaxed">Defina o build mínimo por plataforma após verificar sua disponibilidade para todos na loja. Builds menores ficam bloqueados. Use 0 para suspender a exigência. Esta regra só funciona nos apps que já incluem o verificador de versão.</p>
    <button type="button" className="mt-3 min-h-11 rounded-xl border px-3 text-sm" disabled={busy} onClick={() => void load()}>Recarregar configuração</button>
    {policies ? <form className="mt-4 space-y-4" onSubmit={async e => {
      e.preventDefault()
      if (!review) { setReview(true); return }
      setBusy(true); setMessage('')
      try {
        const next = await request<AppPolicy>('/admin/app-policy', { method: 'PUT', body: JSON.stringify({ platform, minimumBuild: Number(build), version, expectedRevision: policies.find(p => p.platform === platform)?.revision, storeAvailable: confirmed }) })
        setPolicies(list => list!.map(p => p.platform === platform ? next : p)); setReview(false); setConfirmed(false); setMessage('Configuração salva. Os apps compatíveis verificam a regra ao abrir, voltar ao primeiro plano e a cada 5 minutos.')
      } catch (err) { setMessage((err as Error).message) } finally { setBusy(false) }
    }}>
      <fieldset disabled={busy || review} className="space-y-3">
        <label className="block text-sm font-semibold">Plataforma<select className={field} value={platform} onChange={e => choose(e.target.value as StorePlatform)}><option value="ios">iPhone · App Store</option><option value="android">Android · Google Play</option></select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Versão disponível<input className={field} required pattern="[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}" placeholder="1.6.5" value={version} onChange={e => setVersion(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Build mínimo (0 desliga)<input className={field} type="number" required min={0} max={2147483647} step={1} value={build} onChange={e => { setBuild(e.target.value); setConfirmed(false) }} /></label>
        </div>
        <a className="inline-flex min-h-11 items-center text-sm underline" href={STORE_URLS[platform]} target="_blank" rel="noopener noreferrer">Conferir página na loja</a>
        {Number(build) > 0 ? <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmei que este build está disponível para todos os usuários na loja desta plataforma. Upload, análise e TestFlight isoladamente não confirmam isso.</label> : null}
      </fieldset>
      {review ? <p role="status" className="rounded-xl border p-3 text-sm font-semibold">{Number(build) > 0 ? `Bloquear ${platform === 'ios' ? 'iPhones' : 'Androids'} com build menor que ${build}. Versão oferecida: ${version}.` : `Suspender atualização obrigatória no ${platform === 'ios' ? 'iPhone' : 'Android'}.`}</p> : null}
      <div className="flex flex-wrap gap-2"><button disabled={busy} className="min-h-11 rounded-xl border px-4 font-semibold">{busy ? 'Salvando…' : review ? 'Confirmar configuração' : 'Revisar configuração'}</button>{review ? <button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4" onClick={() => setReview(false)}>Voltar</button> : null}</div>
    </form> : null}
    {message ? <p role="status" className="mt-3 text-sm leading-relaxed">{message}</p> : null}
  </details>
}
