import { EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signInWithCustomToken, type Auth } from 'firebase/auth';
import { firebasePasskeyClient } from './firebase-client.mjs';

export function createPasskeys(getAuth: () => Auth, endpoint: string) {
  return firebasePasskeyClient({
    endpoint,
    currentUser: () => getAuth().currentUser,
    async reauthenticate(password?: string) {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Entre para continuar.');
      if (password && user.email && user.providerData.some(p => p.providerId === 'password')) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      } else if (user.providerData.some(p => p.providerId === 'google.com')) {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      } else if (user.providerData.some(p => p.providerId === 'apple.com')) {
        await reauthenticateWithPopup(user, new OAuthProvider('apple.com'));
      } else {
        throw new Error('Confirme a senha da conta.');
      }
    },
    completeLogin: (token: string) => signInWithCustomToken(getAuth(), token),
  });
}

import { getAuth } from 'firebase/auth';
export const passkeys = createPasskeys(getAuth, (import.meta.env.VITE_PASSKEY_API_URL || '').replace(/\/$/, '') + '/auth/passkeys');
