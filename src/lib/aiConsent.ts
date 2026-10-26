import { PRIVACY_URL } from './legal'

export type AiOperation = 'chat' | 'transcribe' | 'tts' | 'translate' | 'avatar'
export const AI_DISCLOSURES: Record<AiOperation, { title: string; detail: string; gemini?: boolean }> = {
  chat: { title: 'Enviar texto para a IA?', detail: 'O pedido, os textos e o histórico incluídos nesta ação serão enviados pelo AlvoPrompter ao Google Gemini. A Groq pode receber o mesmo conteúdo como alternativa, para gerar, revisar ou traduzir o texto.', gemini: true },
  transcribe: { title: 'Enviar áudio para transcrição?', detail: 'O áudio selecionado será enviado pelo AlvoPrompter à Groq para criar o texto e os tempos das palavras. O Cloudflare Workers AI pode receber o mesmo áudio como alternativa.' },
  tts: { title: 'Enviar texto para criar a narração?', detail: 'O texto selecionado será enviado pelo AlvoPrompter ao Google Gemini para gerar o arquivo de voz.', gemini: true },
  translate: { title: 'Enviar texto para tradução?', detail: 'O texto selecionado e os idiomas serão enviados pelo AlvoPrompter ao Cloudflare Workers AI para produzir a tradução.' },
  avatar: { title: 'Enviar descrição para gerar a imagem?', detail: 'A descrição que você escreveu será enviada pelo AlvoPrompter ao Cloudflare Workers AI. Esta ação não envia sua foto nem uma amostra de voz.' },
}

// Permission is deliberately limited to this action, with no persistent or shared grant.
// The native dialog provides a focus trap and sits above recorder/editor overlays.
export function requestAiConsent(operation: AiOperation, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Operação cancelada.', 'AbortError'))
  if (typeof document === 'undefined') return Promise.reject(new Error('Não foi possível solicitar autorização para enviar à IA.'))
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog')
    if (typeof dialog.showModal !== 'function') { reject(new Error('Atualize o aplicativo ou navegador para autorizar o envio à IA.')); return }
    const disclosure = AI_DISCLOSURES[operation]
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.className = 'ai-consent-dialog'
    const title = document.createElement('h2')
    title.id = `ai-consent-title-${crypto.randomUUID()}`
    title.textContent = disclosure.title
    dialog.setAttribute('aria-labelledby', title.id)
    const details = document.createElement('p')
    details.textContent = disclosure.detail
    details.id = `${title.id}-detail`
    dialog.setAttribute('aria-describedby', details.id)
    const notice = document.createElement('p')
    notice.textContent = disclosure.gemini
      ? 'Não envie dados pessoais, sensíveis ou confidenciais ao Gemini gratuito: nesse regime, o Google pode usar os conteúdos para melhorar seus produtos. Confira a política antes de continuar.'
      : 'Envie somente material que você tem autorização para compartilhar. Os fornecedores processam os dados conforme suas condições e a nossa política.'
    const privacy = document.createElement('a')
    privacy.href = PRIVACY_URL; privacy.target = '_blank'; privacy.rel = 'noopener noreferrer'
    privacy.textContent = 'Privacidade e uso de dados'
    const choice = document.createElement('p')
    choice.textContent = 'A autorização vale apenas para esta ação. Você pode continuar escrevendo, ensaiando e gravando localmente sem enviar à IA.'
    const actions = document.createElement('div')
    actions.className = 'ai-consent-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'; cancel.textContent = 'Não enviar'; cancel.autofocus = true
    const allow = document.createElement('button')
    allow.type = 'button'; allow.textContent = 'Autorizar e continuar'; allow.className = 'ai-consent-allow'
    let settled = false
    const finish = (allowed: boolean) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      dialog.remove()
      if (previousFocus?.isConnected) previousFocus.focus()
      if (allowed && !signal?.aborted) resolve()
      else reject(new DOMException('Envio à IA cancelado. Nenhum conteúdo foi enviado por esta ação.', 'AbortError'))
    }
    const abort = () => finish(false)
    cancel.addEventListener('click', abort)
    allow.addEventListener('click', () => finish(true))
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
    dialog.addEventListener('close', abort)
    actions.append(cancel, allow)
    dialog.append(title, details, notice, privacy, choice, actions)
    document.body.append(dialog)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { finish(false); return }
    try { dialog.showModal() } catch { finish(false) }
  })
}
