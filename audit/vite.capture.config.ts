import { defineConfig, type UserConfig } from 'vite'
import base from '../vite.config'

// Immutable browser QA build: development hot reload must never restart a take.
export default defineConfig(() => {
  const config = (base as (env: { mode: string; command: 'build' }) => UserConfig)({ mode: 'capacitor', command: 'build' })
  return { ...config, build: { outDir: 'artifacts/capture-rebuild-2026-11-23/browser-qa', rollupOptions: { input: {
    stability: 'audit/recorder-stability-harness.html',
    flow: 'audit/prompter-flow-harness.html',
  } } } }
})
