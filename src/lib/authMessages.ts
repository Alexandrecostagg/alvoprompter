export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Não foi possível entrar. Confira seu e-mail e sua senha.',
    'auth/wrong-password': 'Não foi possível entrar. Confira seu e-mail e sua senha.',
    'auth/user-not-found': 'Não foi possível entrar. Confira seu e-mail e sua senha.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/email-already-in-use': 'Não foi possível criar a conta. Tente entrar ou recuperar sua senha.',
    'auth/weak-password': 'Use uma senha mais forte, com pelo menos 8 caracteres.',
    'auth/password-does-not-meet-requirements': 'A senha não atende aos requisitos de segurança. Use uma senha mais longa e variada.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/network-request-failed': 'Verifique sua conexão e tente novamente.',
    'auth/popup-blocked': 'Permita a janela de login no navegador e tente novamente.',
    'auth/unauthorized-domain': 'O login social ainda precisa ser ativado neste endereço. Use e-mail e senha por enquanto.',
    'auth/operation-not-allowed': 'Este método de entrada ainda não está disponível. Use e-mail e senha.',
    'auth/operation-not-supported-in-this-environment': 'Este método de entrada não está disponível neste ambiente. Use e-mail e senha.',
    'auth/account-exists-with-different-credential': 'Entre pelo método que você já usou para criar esta conta. Não vinculamos contas automaticamente.',
    'auth/user-disabled': 'Esta conta está desativada.',
  }
  return messages[code] ?? (code ? 'Não foi possível concluir o login. Tente novamente ou use e-mail e senha.' : error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.')
}

export function isAuthCancellation(error: unknown): boolean {
  return ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/canceled', 'auth/web-context-cancelled', 'CANCELED', 'ERROR_CANCELED'].includes((error as { code?: string })?.code ?? '')
}

export function signupError(name: string, password: string, confirmation: string): string | null {
  if (name.trim().length < 2 || name.trim().length > 100) return 'Informe seu nome completo, com até 100 caracteres.'
  if (password.length < 8) return 'Use uma senha com pelo menos 8 caracteres.'
  if (password.length > 128) return 'Use uma senha com até 128 caracteres.'
  if (password !== confirmation) return 'As senhas não coincidem. Confira a confirmação.'
  return null
}
