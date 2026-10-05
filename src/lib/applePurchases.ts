import { Capacitor } from '@capacitor/core'
import { accountFetch } from './saas'
import type { PlanId } from './plans'

export const APPLE_PRODUCT_IDS = {
  creator: 'com.alvoprompt.app.creator.monthly',
  studio: 'com.alvoprompt.app.studio.monthly',
} as const

export function isAppleApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

async function purchases() {
  if (!isAppleApp() || !Capacitor.isPluginAvailable('NativePurchases')) throw new Error('Compras pela App Store indisponíveis neste aplicativo. Atualize o app.')
  return import('@capgo/native-purchases')
}

export async function loadApplePrices(): Promise<Partial<Record<Exclude<PlanId, 'free'>, string>>> {
  const { NativePurchases, PURCHASE_TYPE } = await purchases()
  const supported = await NativePurchases.isBillingSupported()
  if (!supported.isBillingSupported) throw new Error('A App Store não permite compras neste aparelho.')
  const { products } = await NativePurchases.getProducts({ productIdentifiers: Object.values(APPLE_PRODUCT_IDS), productType: PURCHASE_TYPE.SUBS })
  return Object.fromEntries(Object.entries(APPLE_PRODUCT_IDS).flatMap(([plan, id]) => {
    const product = products.find((item) => item.identifier === id)
    return product?.priceString ? [[plan, product.priceString]] : []
  })) as Partial<Record<Exclude<PlanId, 'free'>, string>>
}

async function purchaseSession(): Promise<{ appAccountToken: string; products: typeof APPLE_PRODUCT_IDS }> {
  return accountFetch('/billing/apple/session')
}

async function verify(transactionId: string): Promise<void> {
  await accountFetch('/billing/apple/verify', { method: 'POST', body: JSON.stringify({ transactionId }) })
}

export async function buyApplePlan(plan: Exclude<PlanId, 'free'>): Promise<void> {
  const { NativePurchases, PURCHASE_TYPE } = await purchases()
  const session = await purchaseSession()
  if (session.products[plan] !== APPLE_PRODUCT_IDS[plan]) throw new Error('O produto da App Store não corresponde ao plano solicitado.')
  const transaction = await NativePurchases.purchaseProduct({
    productIdentifier: session.products[plan], productType: PURCHASE_TYPE.SUBS,
    appAccountToken: session.appAccountToken, autoAcknowledgePurchases: false,
  })
  await verify(transaction.transactionId)
  await NativePurchases.acknowledgePurchase({ purchaseToken: transaction.transactionId })
}

export async function restoreApplePlans(): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await purchases()
  const session = await purchaseSession()
  const currentPurchases = async () => {
    try {
      const { purchases: records } = await NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.SUBS, onlyCurrentEntitlements: true,
      })
      return records.filter((record) =>
        Object.values(APPLE_PRODUCT_IDS).includes(record.productIdentifier as typeof APPLE_PRODUCT_IDS[keyof typeof APPLE_PRODUCT_IDS])
        && record.appAccountToken?.toLowerCase() === session.appAccountToken.toLowerCase())
    } catch {
      throw new Error('Não foi possível consultar suas compras na App Store. Confira sua conexão e tente novamente.')
    }
  }
  // StoreKit keeps current entitlements synchronized, including after reinstall.
  // Force an authenticated AppStore.sync only when the account has no local entitlement.
  let records = await currentPurchases()
  if (!records.length) {
    try { await NativePurchases.restorePurchases() }
    catch {
      throw new Error('A App Store não conseguiu sincronizar suas compras. Confira se está usando a mesma Conta Apple da compra e tente novamente. Seu plano atual não foi alterado.')
    }
    records = await currentPurchases()
  }
  let restored = false
  for (const record of records) {
    if (!Object.values(APPLE_PRODUCT_IDS).includes(record.productIdentifier as typeof APPLE_PRODUCT_IDS[keyof typeof APPLE_PRODUCT_IDS])) continue
    // StoreKit exposes UUID strings in uppercase; the account token from our API is lowercase.
    // Filter here and let the server independently verify the signed purchase ownership.
    if (record.appAccountToken?.toLowerCase() !== session.appAccountToken.toLowerCase()) continue
    await verify(record.transactionId)
    try { await NativePurchases.acknowledgePurchase({ purchaseToken: record.transactionId }) }
    catch (error) {
      if (!/already finished|not found/i.test((error as Error).message)) throw error
    }
    restored = true
  }
  return restored
}

export async function manageAppleSubscription(): Promise<void> {
  const { NativePurchases } = await purchases()
  await NativePurchases.manageSubscriptions()
}
