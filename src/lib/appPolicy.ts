export type StorePlatform = 'ios' | 'android'
export interface AppPolicy {
  platform: StorePlatform
  minimumBuild: number
  version: string
  revision: number
}
export const STORE_URLS: Record<StorePlatform, string> = {
  ios: 'https://apps.apple.com/app/id6815460612',
  android: 'https://play.google.com/store/apps/details?id=com.alvoprompt.app',
}
export function parsePolicy(value: unknown, platform: StorePlatform): AppPolicy | null {
  const p = value as Partial<AppPolicy> | null
  if (!p || p.platform !== platform || !Number.isSafeInteger(p.minimumBuild) || p.minimumBuild! < 0 || !Number.isSafeInteger(p.revision) || p.revision! < 0 || typeof p.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(p.version)) return null
  return p as AppPolicy
}
export function updateRequired(policy: AppPolicy | null, build: string): boolean {
  return Boolean(policy && /^\d+$/.test(build) && Number.isSafeInteger(Number(build)) && Number(build) < policy.minimumBuild)
}
