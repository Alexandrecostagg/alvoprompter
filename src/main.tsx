import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import NativeUpdateGate from './components/NativeUpdateGate'

async function retireLegacyNativePwa(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const registrations = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : []
    await Promise.all(registrations.map((registration) => registration.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch (error) {
    console.warn('Não foi possível remover o cache PWA legado.', error)
  }
}

void retireLegacyNativePwa()

if (import.meta.env.VITE_CAPTURE_QA === 'true') {
  void import('../audit/NativeCaptureQA').then(({ default: CaptureQA }) => createRoot(document.getElementById('root')!).render(<ErrorBoundary><CaptureQA /></ErrorBoundary>))
} else createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <NativeUpdateGate><App /></NativeUpdateGate>
    </ErrorBoundary>
  </StrictMode>,
)
