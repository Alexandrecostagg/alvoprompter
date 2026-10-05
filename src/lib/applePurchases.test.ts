import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPLE_PRODUCT_IDS, buyApplePlan, loadApplePrices, restoreApplePlans } from './applePurchases'

const mocks = vi.hoisted(() => ({
  accountFetch: vi.fn(),
  native: {
    isBillingSupported: vi.fn(), getProducts: vi.fn(), purchaseProduct: vi.fn(),
    restorePurchases: vi.fn(), getPurchases: vi.fn(), acknowledgePurchase: vi.fn(),
  },
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => true } }))
vi.mock('@capgo/native-purchases', () => ({ NativePurchases: mocks.native, PURCHASE_TYPE: { SUBS: 'subs' } }))
vi.mock('./saas', () => ({ accountFetch: mocks.accountFetch }))
const accountToken = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.accountFetch.mockImplementation(async (path: string) => path.endsWith('/session')
    ? { appAccountToken: accountToken, products: APPLE_PRODUCT_IDS } : {})
  mocks.native.isBillingSupported.mockResolvedValue({ isBillingSupported: true })
})

describe('Apple native purchase flows', () => {
  it('displays the exact localized prices returned by the App Store', async () => {
    mocks.native.getProducts.mockResolvedValue({ products: [
      { identifier: APPLE_PRODUCT_IDS.creator, priceString: 'R$ 29,90' },
      { identifier: APPLE_PRODUCT_IDS.studio, priceString: '11,99 €' },
    ] })
    expect(await loadApplePrices()).toEqual({ creator: 'R$ 29,90', studio: '11,99 €' })
  })
  it('restores only the current account entitlement and accepts uppercase StoreKit tokens', async () => {
    mocks.native.getPurchases.mockResolvedValue({ purchases: [
      { productIdentifier: APPLE_PRODUCT_IDS.creator, transactionId: '123456', appAccountToken: accountToken.toUpperCase() },
      { productIdentifier: APPLE_PRODUCT_IDS.studio, transactionId: '654321', appAccountToken: 'another-account' },
    ] })
    expect(await restoreApplePlans()).toBe(true)
    expect(mocks.native.restorePurchases).not.toHaveBeenCalled()
    expect(mocks.native.getPurchases).toHaveBeenCalledWith({ productType: 'subs', onlyCurrentEntitlements: true })
    expect(mocks.accountFetch).toHaveBeenCalledWith('/billing/apple/verify', { method: 'POST', body: JSON.stringify({ transactionId: '123456' }) })
    expect(mocks.native.acknowledgePurchase).toHaveBeenCalledExactlyOnceWith({ purchaseToken: '123456' })
    expect(mocks.accountFetch).toHaveBeenCalledTimes(2)
  })
  it('does not report restoration when the Apple account has no current entitlements', async () => {
    mocks.native.getPurchases.mockResolvedValue({ purchases: [] })
    expect(await restoreApplePlans()).toBe(false)
    expect(mocks.native.acknowledgePurchase).not.toHaveBeenCalled()
  })
  it('restores existing entitlements even when forced App Store sync would fail', async () => {
    mocks.native.restorePurchases.mockRejectedValue(new Error('Não foi possível completar o pedido'))
    mocks.native.getPurchases.mockResolvedValue({ purchases: [
      { productIdentifier: APPLE_PRODUCT_IDS.creator, transactionId: '123456', appAccountToken: accountToken },
    ] })
    expect(await restoreApplePlans()).toBe(true)
    expect(mocks.native.restorePurchases).not.toHaveBeenCalled()
  })
  it('syncs missing entitlements then verifies the recovered transaction', async () => {
    mocks.native.getPurchases.mockResolvedValueOnce({ purchases: [] }).mockResolvedValueOnce({ purchases: [
      { productIdentifier: APPLE_PRODUCT_IDS.creator, transactionId: '123456', appAccountToken: accountToken },
    ] })
    expect(await restoreApplePlans()).toBe(true)
    expect(mocks.native.restorePurchases).toHaveBeenCalledOnce()
    expect(mocks.native.acknowledgePurchase).toHaveBeenCalledExactlyOnceWith({ purchaseToken: '123456' })
  })
  it('reports sync failure without claiming a successful restoration or changing the plan', async () => {
    mocks.native.getPurchases.mockResolvedValue({ purchases: [] })
    mocks.native.restorePurchases.mockRejectedValue(new Error('Não foi possível completar o pedido'))
    await expect(restoreApplePlans()).rejects.toThrow('A App Store não conseguiu sincronizar')
    expect(mocks.accountFetch).toHaveBeenCalledTimes(1)
    expect(mocks.native.acknowledgePurchase).not.toHaveBeenCalled()
  })
  it('leaves the purchase unfinished if server verification fails so it can be recovered', async () => {
    mocks.native.purchaseProduct.mockResolvedValue({ transactionId: '123456' })
    mocks.accountFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/verify')) throw new Error('Servidor indisponível')
      return { appAccountToken: accountToken, products: APPLE_PRODUCT_IDS }
    })
    await expect(buyApplePlan('creator')).rejects.toThrow('Servidor indisponível')
    expect(mocks.native.acknowledgePurchase).not.toHaveBeenCalled()
  })
})
