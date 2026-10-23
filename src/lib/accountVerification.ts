import { refreshVerifiedUser } from './auth'
import { loadAccount, type AccountSummary } from './saas'

export type AccountVerification =
  | { status: 'unverified'; account: null }
  | { status: 'verified'; account: AccountSummary }
  | { status: 'verified-account-unavailable'; account: null }

// The email confirmation remains valid even if the account API is unavailable.
export async function confirmAccountEmail(): Promise<AccountVerification> {
  if (!await refreshVerifiedUser()) return { status: 'unverified', account: null }
  try { return { status: 'verified', account: await loadAccount() } }
  catch { return { status: 'verified-account-unavailable', account: null } }
}
