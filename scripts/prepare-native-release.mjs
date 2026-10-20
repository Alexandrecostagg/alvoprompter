import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const plist = require('simple-plist'), xcode = require('xcode')
const release = JSON.parse(readFileSync('native/release.json', 'utf8'))
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const firebase = JSON.parse(readFileSync('native/firebase-public.json', 'utf8'))
if (!Number.isSafeInteger(release.buildNumber) || release.buildNumber <= 22 || firebase.ios.BUNDLE_ID !== release.bundleId || firebase.android.project_info.project_id !== 'alvoprompt') throw Error('Native release configuration is invalid')
mkdirSync('ios/App/App', { recursive: true }); mkdirSync('android/app', { recursive: true })
plist.writeFileSync('ios/App/App/GoogleService-Info.plist', firebase.ios)
writeFileSync('android/app/google-services.json', JSON.stringify(firebase.android, null, 2) + '\n')
if (existsSync('android/app/build.gradle')) {
  const path = 'android/app/build.gradle'
  writeFileSync(path, readFileSync(path, 'utf8').replace(/versionCode \d+/, `versionCode ${release.buildNumber}`).replace(/versionName "[^"]+"/, `versionName "${version}"`))
}
if (existsSync('ios/App/App.xcodeproj/project.pbxproj')) {
  const path = 'ios/App/App.xcodeproj/project.pbxproj', project = xcode.project(path)
  project.parseSync()
  const target = project.getFirstTarget().uuid
  const groups = project.hash.project.objects.PBXGroup
  const appGroup = Object.keys(groups).find(key => typeof groups[key] === 'object' && (groups[key].name === 'App' || groups[key].path === 'App'))
  if (!project.hasFile('GoogleService-Info.plist')) {
    const file = new (require('xcode/lib/pbxFile'))('GoogleService-Info.plist')
    file.uuid = project.generateUuid(); file.fileRef = project.generateUuid(); file.target = target
    project.addToPbxFileReferenceSection(file); project.addToPbxBuildFileSection(file)
    project.addToPbxResourcesBuildPhase(file); project.addToPbxGroup(file, appGroup)
  }
  for (const value of Object.values(project.pbxXCBuildConfigurationSection())) {
    if (typeof value !== 'object' || !value.buildSettings || value.buildSettings.PRODUCT_BUNDLE_IDENTIFIER !== release.bundleId) continue
    Object.assign(value.buildSettings, { CURRENT_PROJECT_VERSION: release.buildNumber, MARKETING_VERSION: version, DEVELOPMENT_TEAM: release.appleTeamId, CODE_SIGN_ENTITLEMENTS: 'App/App.entitlements' })
  }
  const attributes = project.getFirstProject().firstProject.attributes
  attributes.TargetAttributes ??= {}; attributes.TargetAttributes[target] ??= {}
  attributes.TargetAttributes[target].SystemCapabilities ??= {}
  attributes.TargetAttributes[target].SystemCapabilities['com.apple.SignInWithApple'] = { enabled: 1 }
  for (const value of Object.values(project.pbxFileReferenceSection())) if (typeof value === 'object' && (value.explicitFileType === undefined || value.explicitFileType === 'undefined')) delete value.explicitFileType
  writeFileSync(path, project.writeSync())
  plist.writeFileSync('ios/App/App/App.entitlements', { 'com.apple.developer.applesignin': ['Default'] })
  const infoPath = 'ios/App/App/Info.plist', info = plist.readFileSync(infoPath)
  const reversed = firebase.ios.REVERSED_CLIENT_ID
  info.CFBundleURLTypes ??= []
  if (reversed && !info.CFBundleURLTypes.some(value => value.CFBundleURLSchemes?.includes(reversed))) info.CFBundleURLTypes.push({ CFBundleURLSchemes: [reversed] })
  plist.writeFileSync(infoPath, info)
}
console.log(`Native configuration ready: ${version} (${release.buildNumber}); Firebase resources and Apple entitlement included.`)
