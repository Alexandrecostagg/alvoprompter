import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function pwaPlugins(): Plugin[] {
  return VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'logo.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'AlvoPrompter — Teleprompter com IA',
      short_name: 'AlvoPrompter',
      description:
        'Seu roteiro no alvo. Seu olhar na câmera. Teleprompter com VoiceTrack, gravação, legendas e editor de vídeo.',
      lang: 'pt-BR',
      theme_color: '#f4f5fa',
      background_color: '#0b0d12',
      display: 'standalone',
      orientation: 'any',
      start_url: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,ttf}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/media\//],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
        },
      ],
    },
  })
}

/**
 * Builds Android/iOS without a PWA service worker. Older AABs registered one
 * inside the Capacitor WebView, so this tiny replacement removes that legacy
 * worker and its caches when an existing installation is upgraded.
 */
function nativeServiceWorkerCleanup(): Plugin {
  return {
    name: 'alvoprompter-native-service-worker-cleanup',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))).then(()=>self.registration.unregister())));`,
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'capacitor' ? [nativeServiceWorkerCleanup()] : pwaPlugins()),
  ],
}))
