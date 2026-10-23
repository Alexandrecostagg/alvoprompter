import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmAccountEmail } from './accountVerification'
import { type AccountSummary } from './saas'

const fake = vi.hoisted(() => ({ verify: vi.fn(), account: vi.fn() }))
vi.mock('./auth', () => ({ refreshVerifiedUser: fake.verify }))
vi.mock('./saas', () => ({ loadAccount: fake.account }))
beforeEach(() => { vi.resetAllMocks() })

describe('confirmation followed by account recovery', () => {
  it('does not treat an uncompleted email link as verification', async () => {
    fake.verify.mockResolvedValue(false)
    expect(await confirmAccountEmail()).toEqual({ status: 'unverified', account: null })
    expect(fake.account).not.toHaveBeenCalled()
  })

  it('retains verified email status when the account service fails, then recovers on retry', async () => {
    const account = { subscription: { plan: 'free' } } as AccountSummary
    fake.verify.mockResolvedValue(true)
    fake.account.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(account)
    expect(await confirmAccountEmail()).toEqual({ status: 'verified-account-unavailable', account: null })
    expect(await confirmAccountEmail()).toEqual({ status: 'verified', account })
  })

  it('waits for the identity refresh before requesting the account', async () => {
    let verify!: (verified: boolean) => void
    fake.verify.mockReturnValue(new Promise<boolean>(resolve => { verify = resolve }))
    fake.account.mockResolvedValue({ subscription: { plan: 'creator' } })
    const result = confirmAccountEmail()
    expect(fake.account).not.toHaveBeenCalled()
    verify(true)
    expect(await result).toMatchObject({ status: 'verified', account: { subscription: { plan: 'creator' } } })
  })

  it('does not turn a failed identity refresh into a successful confirmation', async () => {
    fake.verify.mockRejectedValue(new Error('Session expired'))
    await expect(confirmAccountEmail()).rejects.toThrow('Session expired')
    expect(fake.account).not.toHaveBeenCalled()
  })
})
