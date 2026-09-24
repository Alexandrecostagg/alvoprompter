import { beforeEach, describe, expect, it, vi } from 'vitest'
import { friendlyAuthError, isAuthCancellation, signupError } from './authMessages'
const fake = vi.hoisted(() => {
  const user = { displayName: 'Test', getIdToken: vi.fn(async () => 'token') }
  return { native: false, platform: 'web', plugin: false, user, auth: { currentUser: user }, popup: vi.fn(async () => ({ user })), credential: vi.fn(async () => ({ user })), google: vi.fn(), apple: vi.fn(), nativeOut: vi.fn(), webOut: vi.fn(), profile: vi.fn(), signIn: vi.fn(async () => ({ user })), scopes: vi.fn(), params: vi.fn(), additional: vi.fn(() => null as { isNewUser: boolean } | null), oauthCredential: vi.fn((value) => value), observe: vi.fn(), register: vi.fn(async () => ({ user })) }
})
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => fake.native, getPlatform: () => fake.platform, isPluginAvailable: () => fake.plugin } }))
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  getAuth: () => fake.auth, initializeAuth: () => fake.auth, indexedDBLocalPersistence: {},
  GoogleAuthProvider: class { static credential(idToken: string) { return { idToken, provider: 'google' } }; setCustomParameters = fake.params },
  OAuthProvider: class { addScope = fake.scopes; credential = fake.oauthCredential },
  getAdditionalUserInfo: fake.additional, signInWithPopup: fake.popup, signInWithCredential: fake.credential, signInWithEmailAndPassword: fake.signIn, signOut: fake.webOut,
  createUserWithEmailAndPassword: fake.register, onAuthStateChanged: fake.observe, sendEmailVerification: vi.fn(async () => undefined), sendPasswordResetEmail: vi.fn(), updateProfile: fake.profile,
}))
vi.mock('@capacitor-firebase/authentication', () => ({ FirebaseAuthentication: { signInWithGoogle: fake.google, signInWithApple: fake.apple, signOut: fake.nativeOut } }))
const { signInSocial, socialAvailability, signUserOut, signIn, signUp, observeUser } = await import('./auth')
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fake.additional.mockReturnValue(null); fake.native = false; fake.platform = 'web'; fake.plugin = false; fake.google.mockResolvedValue({ credential: { idToken: 'google-token' } }); fake.apple.mockResolvedValue({ credential: { idToken: 'apple-token', nonce: 'nonce' } }); fake.nativeOut.mockResolvedValue(undefined) })
describe('social authentication transport and session', () => {
  it('uses Firebase popup on web and requests account selection for Google', async () => {
    await signInSocial('google')
    expect(fake.popup).toHaveBeenCalledOnce(); expect(fake.google).not.toHaveBeenCalled()
    expect(fake.params).toHaveBeenCalledWith({ prompt: 'select_account' })
  })
  it('opens profile completion for a newly created social account', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    fake.additional.mockReturnValueOnce({ isNewUser: true })
    await signInSocial('google')
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'alvoprompter:account' }))
  })
  it('keeps unconfigured Apple and native providers unavailable', async () => {
    expect(socialAvailability().apple).toBe(false)
    fake.native = true
    expect(socialAvailability().google).toBe(false)
    await expect(signInSocial('google')).rejects.toThrow('ainda não está ativado')
    expect(fake.popup).not.toHaveBeenCalled()
  })
  it('uses native Google credentials without a WebView popup', async () => {
    fake.native = true; fake.plugin = true
    await signInSocial('google')
    expect(fake.google).toHaveBeenCalledWith({ skipNativeAuth: true })
    expect(fake.credential).toHaveBeenCalledWith(fake.auth, { idToken: 'google-token', provider: 'google' })
    expect(fake.popup).not.toHaveBeenCalled()
  })
  it('passes Apple nonce to Firebase and rejects a missing iOS nonce', async () => {
    vi.stubEnv('VITE_AUTH_APPLE_ENABLED', 'true'); fake.native = true; fake.plugin = true; fake.platform = 'ios'
    await signInSocial('apple')
    expect(fake.oauthCredential).toHaveBeenCalledWith({ idToken: 'apple-token', rawNonce: 'nonce' })
    fake.apple.mockResolvedValueOnce({ credential: { idToken: 'token' } })
    await expect(signInSocial('apple')).rejects.toThrow('validar o retorno')
    expect(fake.credential).toHaveBeenCalledOnce()
  })
  it('requests only name and email for Apple web', async () => {
    vi.stubEnv('VITE_AUTH_APPLE_ENABLED', 'true')
    await signInSocial('apple')
    expect(fake.scopes.mock.calls).toEqual([['email'], ['name']])
    expect(fake.apple).not.toHaveBeenCalled()
  })
  it('rejects incomplete native credentials without creating a session', async () => {
    fake.native = true; fake.plugin = true; fake.google.mockResolvedValueOnce({ credential: null })
    await expect(signInSocial('google')).rejects.toThrow('identificação válida')
    expect(fake.credential).not.toHaveBeenCalled()
  })
  it('clears the web session even when native logout fails', async () => {
    fake.native = true; fake.plugin = true; fake.nativeOut.mockRejectedValueOnce(new Error('offline'))
    await expect(signUserOut()).rejects.toThrow('offline')
    expect(fake.webOut).toHaveBeenCalledWith(fake.auth)
  })
  it('passes existing passwords unchanged on sign-in', async () => {
    await signIn('  user@example.test  ', 'old123')
    expect(fake.signIn).toHaveBeenCalledWith(fake.auth, 'user@example.test', 'old123')
  })
  it('waits for the registered profile before notifying observers', async () => {
    let callback!: () => Promise<void>
    fake.observe.mockImplementationOnce((_auth, listener) => { callback = listener; return () => {} })
    let release!: () => void
    fake.profile.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const notified = vi.fn()
    const unsubscribe = observeUser(notified)
    const registration = signUp('Ana Silva', 'ana@example.test', 'password')
    await Promise.resolve()
    const observing = callback()
    expect(notified).not.toHaveBeenCalled()
    release(); await registration; await observing
    expect(notified).toHaveBeenCalledWith(fake.user)
    unsubscribe()
  })
})
describe('registration and understandable errors', () => {
  it('validates registration confirmation without arbitrary symbol requirements', () => {
    expect(signupError('Ana Silva', 'longa frase exclusiva', 'longa frase exclusiva')).toBeNull()
    expect(signupError('Ana', '12345678', '12345679')).toContain('não coincidem')
    expect(signupError('', '12345678', '12345678')).toContain('nome completo')
  })
  it('handles cancellation and provider configuration without showing raw SDK errors', () => {
    expect(isAuthCancellation({ code: 'auth/popup-closed-by-user' })).toBe(true)
    expect(friendlyAuthError({ code: 'auth/unauthorized-domain' })).toContain('ativado neste endereço')
    expect(friendlyAuthError({ code: 'auth/account-exists-with-different-credential' })).toContain('método que você já usou')
  })
})
