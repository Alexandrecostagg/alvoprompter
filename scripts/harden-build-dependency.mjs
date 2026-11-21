// Backport for an unpatched build-only dependency. Keep its audit warning visible.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('./deepmerge-hardening.json', import.meta.url), 'utf8'))
export function locateDeepmerge() {
  try {
    const pwa = createRequire(import.meta.resolve('vite-plugin-pwa'))
    const workbox = createRequire(pwa.resolve('workbox-build'))
    const resolver = createRequire(workbox.resolve('@rollup/plugin-node-resolve'))
    return resolver.resolve('deepmerge')
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && process.env.npm_config_omit?.includes('dev')) return null
    throw error
  }
}
const sha = content => createHash('sha256').update(content).digest('hex')
export function hardenDeepmerge() {
  const entry = locateDeepmerge()
  if (!entry) return
  let root = dirname(entry)
  while (!existsSync(join(root, 'package.json'))) {
    const parent = dirname(root)
    if (parent === root) throw new Error('Dependency package root unavailable')
    root = parent
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== 'deepmerge' || pkg.version !== manifest.version) {
    throw new Error('Review the deepmerge security backport for this dependency version')
  }
  const updates = []
  for (const [name, hashes] of Object.entries(manifest.files)) {
    const path = join(root, name)
    const original = readFileSync(path, 'utf8')
    if (sha(original) === hashes.patched) continue
    if (sha(original) !== hashes.original) throw new Error(`Unexpected dependency content: ${name}`)
    let patched = original
    for (const kind of ['target', 'source']) {
      const needle = `getKeys(${kind}).forEach(function(key) {\n`
      patched = patched.replace(needle, needle + "\t\t\tif (key === '__proto__') return // CVE-2026-93753 local backport\n")
    }
    if (sha(patched) !== hashes.patched) throw new Error(`Security backport mismatch: ${name}`)
    updates.push([path, patched])
  }
  for (const [path, content] of updates) writeFileSync(path, content)
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  hardenDeepmerge()
  console.log('Build dependency prototype hardening verified.')
}
