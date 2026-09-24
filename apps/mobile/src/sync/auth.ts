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

/** Where the Telegram functions run (functions/src/index.ts sets the same). */
const FUNCTIONS_REGION = 'europe-west1';

function callable<Req, Res>(name: string) {
  const { app, functions } = loadFirebase();
  return functions.httpsCallable<Req, Res>(functions.getFunctions(app.getApp(), FUNCTIONS_REGION), name);
}

/** The server's message, not the SDK's wrapper: "Too many codes. Try again in 40 s." */
function serverMessage(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  // Not deployed, or no network: nothing the user can fix here but SMS.
  if (/not-found|unavailable|internal/.test(code)) return new Error('Telegram sign-in is not available right now. Use SMS instead.');
  return new Error(e instanceof Error ? e.message.replace(/^\[[^\]]+\]\s*/, '') : String(e));
}

/**
 * Sends a login code to the number's Telegram ("Verification Codes" chat),
 * through the sendTelegramCode function. Throws if the number has no Telegram;
 * the caller offers SMS instead. Returns the request to confirm.
 */
export async function sendTelegramCode(phoneNumber: string): Promise<string> {
  try {
    const { data } = await callable<{ phone: string }, { requestId: string }>('sendTelegramCode')({ phone: phoneNumber });
    return data.requestId;
  } catch (e) {
    throw serverMessage(e);
  }
}

/** Checks the code on the server, which answers with a Firebase token for that phone's account. */
export async function confirmTelegramCode(requestId: string, code: string): Promise<void> {
  let token: string;
  try {
    ({ data: { token } } = await callable<{ requestId: string; code: string }, { token: string }>('verifyTelegramCode')({ requestId, code }));
  } catch (e) {
    throw serverMessage(e);
  }
  const { m, instance } = auth();
  await m.signInWithCustomToken(instance, token);
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
