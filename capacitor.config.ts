import { existsSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

// Do not load Firebase native code before its platform app is registered.
// Without google-services.json, Firebase Auth can crash during Android startup.
const basePlugins = ['@capacitor/app', '@capacitor/filesystem', '@capacitor/share', '@capacitor/splash-screen', '@capacitor/status-bar'];
const authPlugin = '@capacitor-firebase/authentication';
const androidAuth = existsSync('android/app/google-services.json');
const iosAuth = existsSync('ios/App/App/GoogleService-Info.plist');
const config: CapacitorConfig = {
  appId: 'com.alvoprompt.app',
  appName: 'AlvoPrompter',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: { includePlugins: [...basePlugins, ...(androidAuth ? [authPlugin] : [])] },
  ios: { includePlugins: [...basePlugins, ...(iosAuth ? [authPlugin] : [])] },
  ...(iosAuth ? { experimental: { ios: { spm: { swiftToolsVersion: '6.1', packageTraits: { [authPlugin]: ['Google'] }, packageOptions: { [authPlugin]: { symlink: true } } } } } } : {}),
  plugins: {
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com', 'apple.com'] },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0B0D12',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
    },
  },
};

export default config;
