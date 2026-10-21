import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_PRODUCT_IDS, buyGooglePlan, loadGooglePrices, restoreGooglePlans } from './googlePurchases'
const mocks = vi.hoisted(() => ({ accountFetch: vi.fn(), native: { isBillingSupported: vi.fn(), getProducts: vi.fn(), purchaseProduct: vi.fn(), getPurchases: vi.fn() } }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => true } }))
vi.mock('@capgo/native-purchases', () => ({ NativePurchases: mocks.native, PURCHASE_TYPE: { SUBS: 'subs' } }))
vi.mock('./saas', () => ({ accountFetch: mocks.accountFetch }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.accountFetch.mockImplementation(async path => path.endsWith('/session') ? { appAccountToken: 'opaque-account', products: GOOGLE_PRODUCT_IDS, basePlan: 'mensal' } : { status: 'active' })
  mocks.native.isBillingSupported.mockResolvedValue({ isBillingSupported: true })
  mocks.native.getProducts.mockResolvedValue({ products: [{ identifier: 'mensal', planIdentifier: GOOGLE_PRODUCT_IDS.creator, priceString: 'R$ 29,90', offerToken: 'offer' }] })
})
describe('Google Play purchase client', () => {
  it('uses the localized monthly base price and excludes trial/promotional offers', async () => {
    mocks.native.getProducts.mockResolvedValue({ products: [
      { identifier: 'mensal', planIdentifier: GOOGLE_PRODUCT_IDS.creator, priceString: 'R$ 0,00', offerToken: 'trial', offerId: 'trial' },
      { identifier: 'mensal', planIdentifier: GOOGLE_PRODUCT_IDS.creator, priceString: 'R$ 29,90', offerToken: 'regular' },
    ] })
    expect(await loadGooglePrices()).toEqual({ creator: 'R$ 29,90' })
  })
  it('binds the purchase to the opaque account and sends the token only to verification', async () => {
    mocks.native.purchaseProduct.mockResolvedValue({ purchaseState: '1', purchaseToken: 'token' })
    expect(await buyGooglePlan('creator')).toBe(true)
    expect(mocks.native.purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ productIdentifier: GOOGLE_PRODUCT_IDS.creator, planIdentifier: 'mensal', offerToken: 'offer', appAccountToken: 'opaque-account', autoAcknowledgePurchases: false }))
    expect(mocks.accountFetch).toHaveBeenLastCalledWith('/billing/google/verify', { method: 'POST', body: JSON.stringify({ purchaseToken: 'token' }) })
  })
  it('does not grant a plan when the payment is pending', async () => {
    mocks.native.purchaseProduct.mockResolvedValue({ purchaseState: '2', purchaseToken: 'pending' })
    expect(await buyGooglePlan('creator')).toBe(false)
    expect(mocks.accountFetch).toHaveBeenCalledTimes(1)
  })
  it('restores only completed purchases of the current account and known products', async () => {
    mocks.native.getPurchases.mockResolvedValue({ purchases: [
      { purchaseState: '1', purchaseToken: 'ours', appAccountToken: 'opaque-account', productIdentifier: GOOGLE_PRODUCT_IDS.creator },
      { purchaseState: '1', purchaseToken: 'other', appAccountToken: 'other-account', productIdentifier: GOOGLE_PRODUCT_IDS.creator },
      { purchaseState: '2', purchaseToken: 'pending', appAccountToken: 'opaque-account', productIdentifier: GOOGLE_PRODUCT_IDS.studio },
    ] })
    expect(await restoreGooglePlans()).toBe(true)
    expect(mocks.accountFetch).toHaveBeenCalledTimes(2)
  })
})
