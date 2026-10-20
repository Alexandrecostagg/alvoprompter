import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bgsk_[A-Za-z0-9]{30,}/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g,
  /\bAKIA[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g,
]
// Firebase web config is a public application identifier, not an admin credential.
const publicKey = JSON.parse(readFileSync('src/lib/firebase-config.json', 'utf8')).apiKey
const publicKeys = new Set([publicKey])
if (existsSync('native/firebase-public.json')) {
  const native = JSON.parse(readFileSync('native/firebase-public.json', 'utf8'))
  // Firebase client API keys identify public native apps. They confer no admin role.
  if (native.ios?.PROJECT_ID !== 'alvoprompt' || native.android?.project_info?.project_id !== 'alvoprompt') throw Error('Unexpected native Firebase project')
  publicKeys.add(native.ios.API_KEY)
  for (const client of native.android.client ?? []) for (const key of client.api_key ?? []) publicKeys.add(key.current_key)
}
const files = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))
function walk(dir) {
  if (!existsSync(dir)) return
  for (const item of readdirSync(dir)) {
    const file = join(dir, item)
    if (statSync(file).isDirectory()) walk(file)
    else files.add(file)
  }
}
walk('public'); walk('dist')
let failed = false
for (const file of files) {
  if (!existsSync(file) || statSync(file).size > 10_000_000) continue
  const content = readFileSync(file, 'utf8')
  if (patterns.some(pattern => [...content.matchAll(pattern)].some(m => !publicKeys.has(m[0])))) {
    console.error(`Possível segredo em ${file}. Revise localmente; valor omitido.`)
    failed = true
  }
}
if (failed) process.exitCode = 1
else console.log(`Verificação de segredos: ${files.size} arquivos, sem correspondências privadas nos padrões examinados.`)
