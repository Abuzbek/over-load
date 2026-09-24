import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCode, GatewayError, nextRate, normalizePhone, RATE, sendCode } from './telegram';

test('normalizePhone keeps E.164 and rejects the rest', () => {
  assert.equal(normalizePhone('+998 (90) 123-45-67'), '+998901234567');
  assert.equal(normalizePhone('998901234567'), null);
  assert.equal(normalizePhone('+0123456789'), null);
  assert.equal(normalizePhone(42), null);
});

test('nextRate allows one a minute and caps the hour', () => {
  let state = undefined;
  let now = 0;
  for (let i = 0; i < RATE.maxPerWindow; i++) {
    const r = nextRate(state, now);
    assert.ok(r.ok);
    state = r.state;
    assert.deepEqual(nextRate(state, now + 1000).ok, false); // too soon
    now += RATE.minGapMs;
  }
  assert.equal(nextRate(state, now).ok, false); // hour used up
  assert.ok(nextRate(state, RATE.windowMs).ok); // new hour
});

const gateway = (reply: object) =>
  (async (_url: string, init: { body: string }) => ({ status: 200, json: async () => ({ ...reply, sent: JSON.parse(init.body) }) })) as unknown as typeof fetch;

test('checkCode trusts the phone Telegram returns, only for a valid code', async () => {
  const ok = gateway({ ok: true, result: { request_id: 'r', phone_number: '+998901234567', verification_status: { status: 'code_valid' } } });
  assert.deepEqual(await checkCode(ok, 't', 'r', '123456'), { ok: true, phone: '+998901234567' });
  const bad = gateway({ ok: true, result: { request_id: 'r', phone_number: '+998901234567', verification_status: { status: 'code_invalid' } } });
  assert.deepEqual(await checkCode(bad, 't', 'r', '000000'), { ok: false, reason: 'code_invalid' });
});

test('a Gateway error surfaces as GatewayError', async () => {
  await assert.rejects(sendCode(gateway({ ok: false, error: 'PHONE_NUMBER_INVALID' }), 't', '+1'), GatewayError);
});
