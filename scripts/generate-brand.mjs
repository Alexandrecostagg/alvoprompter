import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const svg = await readFile('public/logo.svg')
const png = (file, size, input = svg) => sharp(input).resize(size, size).png().toFile(file)
await writeFile('public/favicon.svg', svg)
await writeFile('landing/favicon.svg', svg)
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) await png(`public/${file}`, size)
await mkdir('docs/brand', { recursive: true })
await png('docs/brand/app-icon-1024.png', 1024)
const android = 'android/app/src/main/res'
for (const [density, scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]) {
  const folder = `${android}/mipmap-${density}`
  try { await readdir(folder) } catch { continue }
  for (const name of ['ic_launcher','ic_launcher_round']) await png(`${folder}/${name}.png`, 48*scale)
  await png(`${folder}/ic_launcher_foreground.png`, 108*scale)
}
try { await sharp(svg).resize(1024,1024).flatten({background:'#2364ff'}).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png') } catch (e) { if(e.code !== 'ENOENT') throw e }
async function splash(file) {
  const {width,height} = await sharp(file).metadata()
  const icon = await sharp(svg).resize(Math.round(Math.min(width,height)*.24)).png().toBuffer()
  const rendered = await sharp({ create: { width, height, channels:4, background:'#0b0d12' }}).composite([{input:icon,gravity:'centre'}]).png().toBuffer()
  await writeFile(file,rendered)
}
for(const directory of [android,'ios/App/App/Assets.xcassets/Splash.imageset']) {
  async function walk(dir) { for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])) { const f=path.join(dir,e.name); if(e.isDirectory()) await walk(f); else if(/^splash.*\.png$/.test(e.name)) await splash(f) } }
  await walk(directory)
}
console.log('Logo e ícones gerados para web, Android e iOS.')
