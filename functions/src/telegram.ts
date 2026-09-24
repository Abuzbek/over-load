/**
 * Telegram Gateway (https://core.telegram.org/gateway/api): sends a login code
 * to the "Verification Codes" chat of whoever has this number on Telegram, and
 * checks what the user typed. Pure of Firebase so it can be tested alone.
 */

const GATEWAY = 'https://gatewayapi.telegram.org';

export type RequestStatus = {
  request_id: string;
  phone_number: string;
  verification_status?: { status: 'code_valid' | 'code_invalid' | 'code_max_attempts_exceeded' | 'expired' };
};

type Fetch = typeof fetch;

/** "+998 90 123-45-67" → "+998901234567", or null when it cannot be an E.164 number. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const phone = input.replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

/** Codes a number may request: one a minute, and at most this many an hour. */
export const RATE = { minGapMs: 60_000, windowMs: 3_600_000, maxPerWindow: 5 };

export type RateState = { windowStart: number; count: number; lastSentAt: number };

/**
 * Every code costs money, and anyone can call the function, so each number is
 * throttled. Returns the state to store, or the ms to wait.
 */
export function nextRate(state: RateState | undefined, now: number): { ok: true; state: RateState } | { ok: false; retryInMs: number } {
  if (state && now - state.lastSentAt < RATE.minGapMs) return { ok: false, retryInMs: RATE.minGapMs - (now - state.lastSentAt) };
  const fresh = !state || now - state.windowStart >= RATE.windowMs;
  if (!fresh && state.count >= RATE.maxPerWindow) return { ok: false, retryInMs: state.windowStart + RATE.windowMs - now };
  return { ok: true, state: { windowStart: fresh ? now : state.windowStart, count: fresh ? 1 : state.count + 1, lastSentAt: now } };
}

async function call(fetchFn: Fetch, token: string, method: string, params: Record<string, string | number>): Promise<RequestStatus> {
  const res = await fetchFn(`${GATEWAY}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as { ok: boolean; result?: RequestStatus; error?: string };
  if (!body.ok || !body.result) throw new GatewayError(body.error ?? `HTTP ${res.status}`);
  return body.result;
}

export class GatewayError extends Error {}

/** A 6-digit code, refunded by Telegram if not delivered within 5 minutes. */
export function sendCode(fetchFn: Fetch, token: string, phone: string): Promise<RequestStatus> {
  return call(fetchFn, token, 'sendVerificationMessage', { phone_number: phone, code_length: 6, ttl: 300 });
}

/** The phone the code was sent to when `code` is right, else why not. */
export async function checkCode(
  fetchFn: Fetch,
  token: string,
  requestId: string,
  code: string,
): Promise<{ ok: true; phone: string } | { ok: false; reason: string }> {
  const status = await call(fetchFn, token, 'checkVerificationStatus', { request_id: requestId, code });
  const verdict = status.verification_status?.status;
  return verdict === 'code_valid' ? { ok: true, phone: status.phone_number } : { ok: false, reason: verdict ?? 'unknown' };
}
