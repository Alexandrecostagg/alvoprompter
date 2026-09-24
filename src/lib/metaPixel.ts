import { Capacitor } from '@capacitor/core'

const MARKETING_CONSENT_KEY = 'alvoprompter_marketing_consent_v1'
const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() ?? ''

type MetaParams = Record<string, string | number | boolean>

type MetaQueue = {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: MetaQueue
  loaded: boolean
  version: string
}

declare global {
  interface Window {
    fbq?: MetaQueue
    _fbq?: MetaQueue
  }
}

let initialized = false

function hasMarketingConsent(): boolean {
  try {
    return window.localStorage.getItem(MARKETING_CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

function validPixelId(): boolean {
  return /^\d{5,25}$/.test(META_PIXEL_ID)
}

function installMetaQueue(): MetaQueue {
  if (window.fbq) return window.fbq

  const queue = ((...args: unknown[]) => {
    if (queue.callMethod) queue.callMethod(...args)
    else queue.queue.push(args)
  }) as MetaQueue

  queue.push = queue
  queue.loaded = true
  queue.version = '2.0'
  queue.queue = []
  window.fbq = queue
  window._fbq = queue

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  return queue
}

/**
 * Inicializa o Pixel apenas na versão web, após consentimento explícito e com ID válido.
 * O app continua funcionando normalmente quando qualquer uma dessas condições não existe.
 */
export function initializeMetaPixel(): boolean {
  if (Capacitor.isNativePlatform()) return false
  if (initialized) return true
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!hasMarketingConsent() || !validPixelId()) return false

  const fbq = installMetaQueue()
  fbq('consent', 'grant')
  fbq('init', META_PIXEL_ID)
  fbq('track', 'PageView')
  initialized = true
  return true
}

export function trackMetaStandard(eventName: 'CompleteRegistration' | 'InitiateCheckout', params: MetaParams = {}): void {
  if (!initializeMetaPixel()) return
  window.fbq?.('track', eventName, params)
}
