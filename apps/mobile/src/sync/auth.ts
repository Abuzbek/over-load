import * as Crypto from 'expo-crypto';
import { googleWebClientId, loadFirebase } from './firebase';

export type Account = {
  uid: string;
  /** The phone number, else email, else name: one line that says who this is. */
  label: string;
  email: string | null;
  name: string | null;
  /** How they signed in: 'Apple', 'Google' or 'Phone'. */
  provider: string | null;
};

const PROVIDERS: Record<string, string> = { 'apple.com': 'Apple', 'google.com': 'Google', phone: 'Phone' };

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
  const providerId = user.providerData[0]?.providerId;
  return {
    uid: user.uid,
    label: user.phoneNumber ?? user.email ?? user.displayName ?? 'Signed in',
    // Apple hides the address behind a relay unless the user shares it; either is the one to show.
    email: user.email ?? user.providerData.find((p) => p.email)?.email ?? null,
    name: user.displayName ?? user.providerData.find((p) => p.displayName)?.displayName ?? null,
    // A Telegram code signs in with a custom token: no provider, but a phone number.
    provider: providerId ? (PROVIDERS[providerId] ?? providerId) : user.phoneNumber ? 'Phone' : null,
  };
}

export function currentAccount(): Account | null {
  return toAccount(auth().instance.currentUser);
}

/** What the server says when the signed-in user no longer exists there. */
const GONE = new Set(['auth/user-not-found', 'auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token']);

/**
 * Asks Firebase whether the cached user still exists. The phone keeps a
 * signed-in user after the account is deleted or disabled in the console, until
 * its token next refreshes (up to an hour). Offline, or any other failure,
 * counts as still there: the app is offline-first, and only the server saying
 * "gone" signs anyone out.
 */
export async function accountStillExists(): Promise<boolean> {
  const { m, instance } = auth();
  const user = instance.currentUser;
  if (!user) return false;
  try {
    await m.reload(user);
    return true;
  } catch (e) {
    return !GONE.has((e as { code?: string }).code ?? '');
  }
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
