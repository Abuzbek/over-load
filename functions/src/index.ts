import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { checkCode, GatewayError, nextRate, normalizePhone, sendCode, type RateState } from './telegram';

initializeApp();
// Closest region to the app's users (Uzbekistan); the app calls the same one.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

/** Set with: firebase functions:secrets:set TELEGRAM_GATEWAY_TOKEN */
const gatewayToken = defineSecret('TELEGRAM_GATEWAY_TOKEN');

/**
 * Server-only bookkeeping per phone number: the send throttle and the last
 * request already exchanged for a login. Firestore rules deny clients all of
 * it (only users/{uid}/… is open); the Admin SDK bypasses them.
 */
const otpDoc = (phone: string) => getFirestore().collection('telegramOtp').doc(phone);

/** Sends a login code to the number's Telegram. Fails if it has no Telegram — the app falls back to SMS. */
export const sendTelegramCode = onCall({ secrets: [gatewayToken] }, async (request) => {
  const phone = normalizePhone(request.data?.phone);
  if (!phone) throw new HttpsError('invalid-argument', 'Phone number must be in international form, like +998901234567.');

  const now = Date.now();
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(otpDoc(phone));
    const verdict = nextRate(snap.data()?.rate as RateState | undefined, now);
    if (!verdict.ok) {
      throw new HttpsError('resource-exhausted', `Too many codes. Try again in ${Math.ceil(verdict.retryInMs / 1000)} s.`);
    }
    tx.set(otpDoc(phone), { rate: verdict.state }, { merge: true });
  });

  try {
    const status = await sendCode(fetch, gatewayToken.value(), phone);
    return { requestId: status.request_id };
  } catch (e) {
    if (e instanceof GatewayError) throw new HttpsError('failed-precondition', `Telegram could not send a code (${e.message}).`);
    throw e;
  }
});

/**
 * Exchanges a correct code for a Firebase sign-in token. The phone comes from
 * Telegram's answer, never from the app. One account per number: an existing
 * user with that phone (say, from SMS sign-in) is reused, else one is created.
 */
export const verifyTelegramCode = onCall({ secrets: [gatewayToken] }, async (request) => {
  const requestId = request.data?.requestId;
  const code = request.data?.code;
  if (typeof requestId !== 'string' || typeof code !== 'string' || !/^\d{4,8}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'A request id and a 4–8 digit code are required.');
  }

  let result;
  try {
    result = await checkCode(fetch, gatewayToken.value(), requestId, code);
  } catch (e) {
    if (e instanceof GatewayError) throw new HttpsError('failed-precondition', `Telegram could not check the code (${e.message}).`);
    throw e;
  }
  if (!result.ok) {
    const message = result.reason === 'expired' ? 'The code expired. Request a new one.'
      : result.reason === 'code_max_attempts_exceeded' ? 'Too many wrong codes. Request a new one.'
      : 'That code is not right.';
    throw new HttpsError('permission-denied', message);
  }
  const phone = result.phone;

  // A code is good for one sign-in: replaying the same request id is refused.
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(otpDoc(phone));
    if (snap.data()?.usedRequestId === requestId) throw new HttpsError('permission-denied', 'This code was already used.');
    tx.set(otpDoc(phone), { usedRequestId: requestId }, { merge: true });
  });

  const auth = getAuth();
  const uid = await auth.getUserByPhoneNumber(phone).then(
    (user) => user.uid,
    async (e: { code?: string }) => {
      if (e.code !== 'auth/user-not-found') throw e;
      return (await auth.createUser({ phoneNumber: phone })).uid;
    },
  );
  return { token: await auth.createCustomToken(uid) };
});
