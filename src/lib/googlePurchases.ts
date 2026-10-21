import { Capacitor } from '@capacitor/core'
import { accountFetch } from './saas'

export const GOOGLE_PRODUCT_IDS = { creator: 'com.alvoprompt.app.creator.monthly', studio: 'com.alvoprompt.app.studio.monthly' } as const
const BASE_PLAN = 'mensal'
async function purchases() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('NativePurchases')) throw new Error('Compras pelo Google Play indisponíveis neste aplicativo.')
  return import('@capgo/native-purchases')
}
async function products() {
  const { NativePurchases, PURCHASE_TYPE } = await purchases()
  if (!(await NativePurchases.isBillingSupported()).isBillingSupported) throw new Error('O Google Play não permite compras neste aparelho.')
  return (await NativePurchases.getProducts({ productIdentifiers: Object.values(GOOGLE_PRODUCT_IDS), productType: PURCHASE_TYPE.SUBS })).products
}
export async function loadGooglePrices(): Promise<Partial<Record<'creator' | 'studio', string>>> {
  const items = await products()
  return Object.fromEntries(Object.entries(GOOGLE_PRODUCT_IDS).flatMap(([plan, id]) => {
    const item = items.find(i => i.planIdentifier === id && i.identifier === BASE_PLAN && !i.offerId && i.offerToken)
    return item ? [[plan, item.priceString]] : []
  }))
}
type Session = { appAccountToken: string; products: typeof GOOGLE_PRODUCT_IDS; basePlan: string }
async function session(): Promise<Session> { return accountFetch('/billing/google/session') }
async function verify(purchaseToken: string): Promise<boolean> {
  const result = await accountFetch<{ status: string }>('/billing/google/verify', { method: 'POST', body: JSON.stringify({ purchaseToken }) })
  return result.status === 'active'
}
export async function buyGooglePlan(plan: 'creator' | 'studio'): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await purchases(), account = await session()
  if (account.products[plan] !== GOOGLE_PRODUCT_IDS[plan] || account.basePlan !== BASE_PLAN) throw new Error('Plano Google Play não reconhecido.')
  const item = (await products()).find(i => i.planIdentifier === account.products[plan] && i.identifier === BASE_PLAN && !i.offerId && i.offerToken)
  if (!item) throw new Error('Este plano ainda não está disponível no Google Play.')
  const transaction = await NativePurchases.purchaseProduct({ productIdentifier: account.products[plan], planIdentifier: BASE_PLAN, offerToken: item.offerToken, productType: PURCHASE_TYPE.SUBS, appAccountToken: account.appAccountToken, autoAcknowledgePurchases: false })
  if (transaction.purchaseState === '2') return false
  if (!transaction.purchaseToken || transaction.purchaseState !== '1') throw new Error('A compra não foi concluída. Confira seu pedido no Google Play.')
  return verify(transaction.purchaseToken)
}
export async function restoreGooglePlans(): Promise<boolean> {
  const { NativePurchases, PURCHASE_TYPE } = await purchases(), account = await session()
  const { purchases: records } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS, onlyCurrentEntitlements: true })
  let restored = false
  for (const record of records) {
    if (record.purchaseState !== '1' || !record.purchaseToken || record.appAccountToken !== account.appAccountToken || !Object.values(GOOGLE_PRODUCT_IDS).includes(record.productIdentifier as typeof GOOGLE_PRODUCT_IDS.creator)) continue
    if (await verify(record.purchaseToken)) restored = true
  }
  return restored
}
export async function manageGoogleSubscription() { const { NativePurchases } = await purchases(); await NativePurchases.manageSubscriptions() }
