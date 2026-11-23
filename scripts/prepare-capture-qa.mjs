// Generates a separately signed QA app. Never changes the production bundle ID or data.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const xcode = require('xcode'), plist = require('simple-plist')
const path = 'ios/App/CameraQA.xcodeproj'
mkdirSync(path, { recursive: true })
const source = 'ios/App/App.xcodeproj/project.pbxproj'
const project = xcode.project(source); project.parseSync()
for (const value of Object.values(project.pbxXCBuildConfigurationSection())) {
  if (typeof value !== 'object' || value.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER !== 'com.alvoprompt.app') continue
  Object.assign(value.buildSettings, { PRODUCT_BUNDLE_IDENTIFIER: 'com.alvoprompt.captureqa', INFOPLIST_FILE: 'App/CaptureQA-Info.plist', CODE_SIGN_ENTITLEMENTS: '""', CODE_SIGN_STYLE: 'Automatic' })
}
const attributes = project.getFirstProject().firstProject.attributes
for (const target of Object.values(attributes.TargetAttributes ?? {})) target.SystemCapabilities = {}
writeFileSync(`${path}/project.pbxproj`, project.writeSync())
const info = plist.readFileSync('ios/App/App/Info.plist')
info.CFBundleDisplayName = 'Alvo Captura QA'
delete info.CFBundleURLTypes
plist.writeFileSync('ios/App/App/CaptureQA-Info.plist', info)
const infoRelease = JSON.parse(readFileSync('native/release.json', 'utf8'))
console.log(`QA bundle com.alvoprompt.captureqa, team ${infoRelease.appleTeamId}; produção permanece com.alvoprompt.app.`)
