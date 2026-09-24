import * as Crypto from 'expo-crypto';
import { googleWebClientId, loadFirebase } from './firebase';

export type Account = { uid: string; label: string };

type AuthModule = ReturnType<typeof loadFirebase>['auth'];
type User = import('@react-native-firebase/auth').User;
type Confirmation = import('@react-native-firebase/auth').ConfirmationResult;

function auth(): { m: AuthModule; instance: ReturnType<AuthModule['getAuth']> } {
  const m = loadFirebase().auth;
  return { m, instance: m.getAuth() };
}

/** What the account row shows: the phone number, else email, else name. */
function toAccount(user: User | null): Account | null {
  if (!user) return null;
  return { uid: user.uid, label: user.phoneNumber ?? user.email ?? user.displayName ?? 'Signed in' };
}

export function currentAccount(): Account | null {
  return toAccount(auth().instance.currentUser);
}

export function onAccountChanged(listener: (account: Account | null) => void): () => void {
  const { m, instance } = auth();
  return m.onAuthStateChanged(instance, (user) => listener(toAccount(user)));
}

/**
 * Apple, with a nonce: Apple signs the hash, Firebase checks it against the
 * raw value, so a stolen identity token cannot be replayed.
 */
export async function signInWithApple(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, iOS only
  const Apple: typeof import('expo-apple-authentication') = require('expo-apple-authentication');
  const nonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const result = await Apple.signInAsync({
    requestedScopes: [Apple.AppleAuthenticationScope.EMAIL, Apple.AppleAuthenticationScope.FULL_NAME],
    nonce: hashed,
  });
  if (!result.identityToken) throw new Error('Apple did not return an identity token');
  const { m, instance } = auth();
  await m.signInWithCredential(instance, m.AppleAuthProvider.credential(result.identityToken, nonce));
}

export async function signInWithGoogle(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module
  const { GoogleSignin, isSuccessResponse } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return; // cancelled
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google did not return an id token');
  const { m, instance } = auth();
  await m.signInWithCredential(instance, m.GoogleAuthProvider.credential(idToken));
}

/** Sends the SMS. The number must be in international form: +998901234567. */
export async function sendPhoneCode(phoneNumber: string): Promise<Confirmation> {
  const { m, instance } = auth();
  return m.signInWithPhoneNumber(instance, phoneNumber);
}

export async function confirmPhoneCode(confirmation: Confirmation, code: string): Promise<void> {
  await confirmation.confirm(code);
}

export async function signOutOfAccount(): Promise<void> {
  const { m, instance } = auth();
  await m.signOut(instance);
}
