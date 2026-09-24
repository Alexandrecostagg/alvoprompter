import { Capacitor } from '@capacitor/core'
import defaultConfig from './firebase-config.json'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || defaultConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || defaultConfig.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || defaultConfig.projectId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || defaultConfig.appId,
}

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean)

let app: FirebaseApp | null = null
let auth: Auth | null = null

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  auth = Capacitor.isNativePlatform() ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app)
  auth.languageCode = 'pt-BR'
}

function requireAuth(): Auth {
  if (!auth) throw new Error('O login ainda não foi configurado neste ambiente.')
  return auth
}

// Wait for the registration name to be persisted before mounting the signed-in UI.
let registration: Promise<void> | null = null

export function observeUser(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null)
    return () => undefined
  }
  let active = true
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (registration) { await registration; user = auth?.currentUser ?? null }
    if (active) callback(user)
  })
  return () => { active = false; unsubscribe() }
}

export async function signUp(name: string, email: string, password: string): Promise<User> {
  let release!: () => void
  registration = new Promise<void>((resolve) => { release = resolve })
  try {
    const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password)
    await updateProfile(credential.user, { displayName: name.trim() })
    await credential.user.getIdToken(true)
    await sendEmailVerification(credential.user).catch(() => undefined)
    return credential.user
  } finally { registration = null; release() }
}

export async function signIn(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(requireAuth(), email.trim(), password)).user
}

export async function signUserOut(): Promise<void> {
  // Always clear the JS session, even if the native provider fails to sign out.
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FirebaseAuthentication')) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
      await FirebaseAuthentication.signOut()
    }
  } finally { await signOut(requireAuth()) }
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(requireAuth(), email.trim())
}

export async function getIdToken(): Promise<string> {
  const instance = requireAuth()
  await instance.authStateReady()
  const user = instance.currentUser
  if (!user) throw new Error('Entre na sua conta para continuar.')
  return user.getIdToken()
}

export async function getOptionalIdToken(): Promise<string | null> {
  await auth?.authStateReady()
  return auth?.currentUser ? auth.currentUser.getIdToken() : null
}

export function currentUser(): User | null { return auth?.currentUser ?? null }

export function requestAccount(): void { window.dispatchEvent(new Event('alvoprompter:account')) }

export type { User }

export async function resendVerification(): Promise<void> {
  const user = requireAuth().currentUser
  if (!user) throw new Error('Entre na sua conta para continuar.')
  await sendEmailVerification(user)
}

export async function refreshVerifiedUser(): Promise<boolean> {
  const user = requireAuth().currentUser
  if (!user) throw new Error('Entre na sua conta para continuar.')
  await user.reload()
  await user.getIdToken(true)
  return user.emailVerified
}

export type SocialProvider = 'google' | 'apple'

export function socialAvailability(): Record<SocialProvider, boolean> {
  const nativeReady = !Capacitor.isNativePlatform() || Capacitor.isPluginAvailable('FirebaseAuthentication')
  return {
    google: firebaseConfigured && nativeReady && import.meta.env.VITE_AUTH_GOOGLE_ENABLED !== 'false',
    apple: firebaseConfigured && nativeReady && import.meta.env.VITE_AUTH_APPLE_ENABLED === 'true',
  }
}

export async function signInSocial(provider: SocialProvider): Promise<User> {
  if (!socialAvailability()[provider]) throw new Error('Este método de entrada ainda não está ativado. Use e-mail e senha.')
  const instance = requireAuth()
  if (!Capacitor.isNativePlatform()) {
    const oauth = provider === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com')
    if (provider === 'google') oauth.setCustomParameters({ prompt: 'select_account' })
    else { oauth.addScope('email'); oauth.addScope('name') }
    const result = await signInWithPopup(instance, oauth)
    if (getAdditionalUserInfo(result)?.isNewUser) requestAccount()
    return result.user
  }
  // Native system UI obtains provider credentials; Firebase JS owns the app session.
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication')
  const result = provider === 'google'
    ? await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true })
    : await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true, scopes: ['email', 'name'] })
  const idToken = result.credential?.idToken
  if (!idToken) throw new Error('O provedor não retornou uma identificação válida. Tente novamente.')
  if (provider === 'apple' && Capacitor.getPlatform() === 'ios' && !result.credential?.nonce) throw new Error('Não foi possível validar o retorno da Apple. Tente novamente.')
  const credential = provider === 'google' ? GoogleAuthProvider.credential(idToken)
    : new OAuthProvider('apple.com').credential({ idToken, rawNonce: result.credential?.nonce })
  const signedIn = await signInWithCredential(instance, credential)
  const user = signedIn.user
  if (!user.displayName && result.user?.displayName) await updateProfile(user, { displayName: result.user.displayName })
  if (getAdditionalUserInfo(signedIn)?.isNewUser) requestAccount()
  return user
}
