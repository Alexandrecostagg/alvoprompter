/** Share a module promise with lazy(), without mounting it or fetching user data. */
export function preloadable<T>(loader: () => Promise<T>) {
  let pending: Promise<T> | undefined
  const load = () => pending ??= loader().catch((error: unknown) => { pending = undefined; throw error })
  const preload = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '')) return
    void load().catch(() => undefined)
  }
  return { load, preload }
}
