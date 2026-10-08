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
  if (patterns.some(pattern => [...content.matchAll(pattern)].some(m => m[0] !== publicKey))) {
    console.error(`Possível segredo em ${file}. Revise localmente; valor omitido.`)
    failed = true
  }
}
if (failed) process.exitCode = 1
else console.log(`Verificação de segredos: ${files.size} arquivos, sem correspondências privadas nos padrões examinados.`)
