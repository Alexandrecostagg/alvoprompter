import { useCallback, useEffect, useState } from 'react'
import { accountFetch } from '../../lib/saas'
import { deletionAuthMethod, reauthenticateForDeletion, signUserOut, type User } from '../../lib/auth'
import { deleteLocalAccount } from '../../lib/deleteLocalAccount'
import { savedSyncPass } from '../../lib/syncWorker'
import { friendlyAuthError, isAuthCancellation } from '../../lib/authMessages'
import { useAppStore } from '../../store/useAppStore'

interface Overview { configured: boolean; workspaces: { id: string; name: string }[]; localWorkspaceIds: string[]; appleSubscription: boolean; googleSubscription?: boolean; deletion: { id: string; status: 'pending' | 'needs_reauth' | 'complete' } | null }
export default function DeleteAccountPanel({ user, onComplete, request = accountFetch, reauthenticate = reauthenticateForDeletion, cleanup = deleteLocalAccount }: { user: User; onComplete: () => void; request?: typeof accountFetch; reauthenticate?: typeof reauthenticateForDeletion; cleanup?: typeof deleteLocalAccount }) {
  const [open, setOpen] = useState(false), [data, setData] = useState<Overview | null>(null), [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(''), [password, setPassword] = useState(''), [acknowledged, setAcknowledged] = useState(false), [eraseDevice, setEraseDevice] = useState(false), [review, setReview] = useState(false), [message, setMessage] = useState('')
  const method = deletionAuthMethod(user), pending = data?.deletion?.status === 'pending', completed = data?.deletion?.status === 'complete'
  const load = useCallback(async () => {
    const next = await request<Overview>('/account/deletion')
    setData(previous => ({ ...next, localWorkspaceIds: [...new Set([...(previous?.localWorkspaceIds ?? []), ...next.localWorkspaceIds])] }))
  }, [request])
  useEffect(() => {
    if (!open) return
    let active = true
    request<Overview>('/account/deletion').then(next => { if (active) setData(next) }).catch(e => { if (active) setMessage(e.message) })
    return () => { active = false }
  }, [open, request])
  useEffect(() => {
    if (!open || !pending) return
    const timer = window.setInterval(() => { void load().catch(() => setMessage('Não foi possível acompanhar agora. Sua solicitação continua registrada. Abra esta seção novamente para conferir.')) }, 5000)
    return () => window.clearInterval(timer)
  }, [open, pending, load])
  async function finish() {
    setBusy(true); setMessage('')
    try {
      await cleanup(user.uid, data?.localWorkspaceIds ?? [], eraseDevice)
      useAppStore.getState().setRecording(null)
      await useAppStore.getState().chooseCloudWorkspace(null)
      sessionStorage.setItem('alvoprompter-account-deleted', 'true')
      await signUserOut()
      onComplete()
    } catch { setMessage('A conta foi excluída na nuvem. Não foi possível concluir a limpeza local ou sair. Tente concluir novamente.') }
    finally { setBusy(false) }
  }
  const field = 'mt-1 min-h-11 w-full rounded-xl border px-3 py-2'
  return <details className="mt-5 rounded-2xl border p-4 sm:p-5" open={open} onToggle={e => setOpen(e.currentTarget.open)} style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
    <summary className="min-h-11 cursor-pointer font-bold" style={{ color: 'var(--danger)' }}>Excluir minha conta</summary>
    <div className="mt-3 space-y-4 text-sm leading-relaxed">
      <p>A exclusão é definitiva. Seu perfil, acessos, dados e arquivos vinculados à conta na nuvem serão removidos. Cópias exportadas ou compartilhadas fora do app não podem ser apagadas por nós.</p>
      <p>A renovação pelo Asaas será cancelada antes da exclusão. Registros que os provedores de pagamento precisem manter seguem as regras desses provedores.</p>
      {data?.workspaces.length ? <p><strong>Seus espaços e seus conteúdos serão excluídos, inclusive para os membros:</strong> {data.workspaces.map(w => w.name).join(', ')}. Exporte o que precisar antes de continuar.</p> : null}
      {data?.appleSubscription ? <div className="space-y-3 rounded-xl border p-3"><p><strong>Assinatura Apple:</strong> excluir a conta não cancela a renovação na App Store. Cancele a assinatura nos ajustes da Apple para evitar novas cobranças.</p><a className="inline-flex min-h-11 items-center underline" href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer">Gerenciar assinatura Apple</a><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={acknowledged} disabled={busy || pending || completed} onChange={e => setAcknowledged(e.target.checked)} />Entendi que preciso cancelar a renovação pela Apple, mesmo excluindo esta conta.</label></div> : null}
      {data?.googleSubscription ? <div className="space-y-3 rounded-xl border p-3"><p><strong>Assinatura Google Play:</strong> excluir a conta não cancela a renovação no Google Play. Cancele para evitar novas cobranças.</p><a className="inline-flex min-h-11 items-center underline" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">Gerenciar assinatura Google Play</a><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={acknowledged} disabled={busy || pending || completed} onChange={e => setAcknowledged(e.target.checked)} />Entendi que preciso cancelar a renovação pelo Google Play, mesmo excluindo esta conta.</label></div> : null}
      {message ? <p role="alert" className="rounded-xl border p-3">{message}</p> : null}
      {pending ? <div role="status" className="space-y-2"><p><strong>Exclusão solicitada.</strong> Seu acesso foi bloqueado. Normalmente a remoção leva alguns minutos. Em falhas temporárias, tentaremos novamente automaticamente. Mantenha esta seção disponível para acompanhar e confirmar sua identidade novamente, se solicitado.</p><button className="min-h-11 rounded-xl border px-4" onClick={() => void load().catch(e => setMessage(e.message))}>Conferir andamento</button></div> : completed ? <div><p role="status" className="font-semibold">Conta excluída. Conclua a limpeza deste aparelho e saia.</p><button className="mt-3 min-h-11 rounded-xl border px-4 font-semibold" disabled={busy} onClick={() => void finish()}>{busy ? 'Concluindo…' : 'Concluir e sair'}</button></div> : data ? <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); if (!review) { setReview(true); return }
        setBusy(true); setMessage('')
        try {
          await reauthenticate(password); setPassword('')
          const pass = savedSyncPass()
          const result = await request<{ id: string; status: 'pending' | 'complete' }>('/account', { method: 'DELETE', headers: pass ? { 'x-sync-pass': pass } : undefined, body: JSON.stringify({ confirmation, appleSubscriptionAcknowledged: acknowledged, googleSubscriptionAcknowledged: acknowledged }) })
          setData(previous => previous ? { ...previous, deletion: result } : previous); setReview(false)
          await cleanup(user.uid, data.localWorkspaceIds, eraseDevice)
        } catch (error) { if (!isAuthCancellation(error)) setMessage(friendlyAuthError(error)); setPassword(''); setReview(false) }
        finally { setBusy(false) }
      }}>
        {data.deletion?.status === 'needs_reauth' ? <p role="alert">A confirmação de identidade venceu durante uma falha de conexão. Confirme novamente para concluirmos a exclusão.</p> : null}
        <fieldset disabled={busy || review} className="space-y-4">
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={eraseDevice} onChange={e => setEraseDevice(e.target.checked)} />Apagar também todos os roteiros, vídeos e arquivos locais deste aparelho, inclusive os criados sem conta. Sem esta opção, removemos apenas as cópias vinculadas à sua conta e equipes.</label>
          {method === 'password' ? <label className="block font-semibold">Senha atual<input className={field} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label> : <p>A confirmação será feita com {method === 'apple' ? 'Apple' : 'Google'}. Use a mesma conta com que entrou no app.</p>}
          <label className="block font-semibold">Digite EXCLUIR para confirmar<input className={field} autoComplete="off" autoCapitalize="characters" required pattern="EXCLUIR" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        </fieldset>
        {review ? <p role="alert" className="rounded-xl border p-3 font-semibold">Confirme a exclusão definitiva desta conta{eraseDevice ? ' e de todos os arquivos locais deste aparelho' : ''}. Esta ação não pode ser desfeita.</p> : null}
        <div className="flex flex-wrap gap-2"><button disabled={busy || !data.configured || confirmation !== 'EXCLUIR' || ((data.appleSubscription || data.googleSubscription) && !acknowledged)} className="min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-50" style={{ color: 'var(--danger)' }}>{busy ? 'Confirmando…' : review ? 'Excluir definitivamente minha conta' : 'Revisar exclusão'}</button>{review ? <button type="button" disabled={busy} className="min-h-11 rounded-xl border px-4" onClick={() => setReview(false)}>Voltar</button> : null}</div>
        {!data.configured ? <p role="status">Serviço temporariamente indisponível. Tente novamente mais tarde.</p> : null}
      </form> : <p role="status">Conferindo dados da conta…</p>}
    </div>
  </details>
}
