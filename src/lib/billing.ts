import { apiBase } from './cloudflare'

export interface BillingAvailability { configured: boolean; sandbox: boolean }

export async function loadBillingAvailability(signal?: AbortSignal): Promise<BillingAvailability> {
  const timeout = AbortSignal.timeout(10_000)
  const response = await fetch(`${apiBase()}/health`, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) throw new Error('Não foi possível verificar as assinaturas. Tente novamente.')
  const body = await response.json() as { billing?: Partial<BillingAvailability> }
  if (typeof body.billing?.configured !== 'boolean' || typeof body.billing.sandbox !== 'boolean') {
    throw new Error('Não foi possível verificar as assinaturas. Tente novamente.')
  }
  return { configured: body.billing.configured, sandbox: body.billing.sandbox }
}
