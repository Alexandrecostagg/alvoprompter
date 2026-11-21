import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compile, optimize } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'

// Reuse the compiler already installed by @tailwindcss/vite. No browser compiler.
const base = resolve('.')
const compiler = await compile('@import "tailwindcss" source(none);', { base, onDependency() {} })
const scanner = new Scanner({ sources: [{ base, pattern: 'landing/index.html', negated: false }, { base, pattern: 'landing/main.js', negated: false }] })
const css = compiler.build(scanner.scan())
await writeFile('landing/utilities.css', optimize(css, { minify: true }).code)
// Fail early on accidental executable inline code that the landing CSP would block.
const html = await readFile('landing/index.html', 'utf8')
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /\son\w+\s*=/i.test(html)) throw new Error('Inline JavaScript is incompatible with the landing CSP.')
console.log('Landing CSS compiled; executable scripts are external.')
