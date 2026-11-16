// Accounts (proof of concept) through the Worker, against an in-memory database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { fakeD1 } from './helpers/d1.js';

const ORIGIN = 'https://fusion.example';
const mkEnv = (extra = {}) => ({
  ASSETS: { fetch: async () => new Response('asset') },
  DB: fakeD1(), SESSION_SECRET: 'test-secret-0123456789abcdef', PBKDF2_ITERATIONS: '10000', ...extra,
});
/** A tiny cookie-keeping client. */
const client = (env) => {
  const jar = new Map();
  return {
    jar,
    async call(path, body, { method = body ? 'POST' : 'GET', headers = {} } = {}) {
      const h = new Headers(headers);
      if (body !== undefined) { h.set('content-type', 'application/json'); if (!h.has('Origin')) h.set('Origin', ORIGIN); }
      if (jar.size) h.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1);
        if (/Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v);
      }
      return { status: res.status, body: await res.json().catch(() => null), res };
    },
  };
};
const PW = 'correct horse battery';

test('without a database or secret, accounts report unavailable and checkout keeps its old behaviour', async () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  const c = client(env);
  const r = await c.call('/api/auth/me');
  assert.equal(r.status, 503); assert.equal(r.body.status, 'unavailable');
  assert.equal((await c.call('/api/auth/register', { email: 'a@b.co', password: PW })).status, 503);
  assert.equal((await c.call('/api/checkout', { plan: 'workspace', interval: 'year' })).status, 501);
  assert.equal((await client({ ...mkEnv(), SESSION_SECRET: 'short' }).call('/api/auth/me')).status, 503);
});

test('register signs you in on the Guided plan, with an HttpOnly session and a readable tier cookie', async () => {
  const env = mkEnv(), c = client(env);
  const r = await c.call('/api/auth/register', { email: ' Ann@Example.com ', password: PW });
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.user.email, r.body.user.tier, r.body.user.planName], ['ann@example.com', 'lite', 'Guided']);
  const set = r.res.headers.getSetCookie();
  assert.match(set.find((s) => s.startsWith('fusion_session=')), /HttpOnly; ?|HttpOnly$/);
  assert.match(set.find((s) => s.startsWith('cpf_tier_v1=')), /^cpf_tier_v1=lite;/);
  assert.doesNotMatch(set.find((s) => s.startsWith('cpf_tier_v1=')), /HttpOnly/);
  const me = await c.call('/api/auth/me');
  assert.equal(me.body.signedIn, true); assert.equal(me.body.user.email, 'ann@example.com');
  // The password is never stored as typed.
  const row = env.DB.raw.prepare('SELECT * FROM users').get();
  assert.notEqual(row.pw_hash, PW); assert.equal(row.pw_hash.length, 64); assert.equal(row.pw_iter, 10000);
});

test('register rejects bad email, short password and a duplicate email', async () => {
  const c = client(mkEnv());
  assert.equal((await c.call('/api/auth/register', { email: 'nope', password: PW })).status, 400);
  assert.equal((await c.call('/api/auth/register', { email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await c.call('/api/auth/register', { email: 'a@b.co', password: PW })).status, 201);
  assert.equal((await c.call('/api/auth/register', { email: 'A@B.CO', password: PW })).status, 409);
});

test('sign in, wrong password, lockout after 10 tries, and sign out', async () => {
  const env = mkEnv();
  await client(env).call('/api/auth/register', { email: 'a@b.co', password: PW });
  const c = client(env);
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: 'wrong password!' })).status, 401);
  assert.equal((await c.call('/api/auth/login', { email: 'nobody@b.co', password: PW })).body.message, 'Email or password is not right.');
  const ok = await c.call('/api/auth/login', { email: 'A@b.co', password: PW });
  assert.equal(ok.status, 200); assert.equal((await c.call('/api/auth/me')).body.signedIn, true);
  await c.call('/api/auth/logout', {});
  assert.equal((await c.call('/api/auth/me')).body.signedIn, false);
  for (let i = 0; i < 9; i++) assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: 'wrong password!' })).status, 401);
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: 'wrong password!' })).status, 429);
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: PW })).status, 429, 'locked even with the right password');
  env.DB.raw.exec('UPDATE users SET locked_until = 1');
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: PW })).status, 200);
});

test('a tampered, foreign or expired session cookie is ignored', async () => {
  const env = mkEnv(), c = client(env);
  await c.call('/api/auth/register', { email: 'a@b.co', password: PW });
  const good = c.jar.get('fusion_session');
  const [body, sig] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'u_other', gen: 0, exp: Date.now() + 1e9 })).toString('base64url');
  for (const bad of [`${forged}.${sig}`, `${body}.${sig.slice(0, -2)}xx`, 'junk', `${body}`]) {
    c.jar.set('fusion_session', bad);
    assert.equal((await c.call('/api/auth/me')).body.signedIn, false, bad.slice(0, 20));
  }
  // The same cookie under a different secret is not accepted.
  c.jar.set('fusion_session', good);
  assert.equal((await client({ ...env, SESSION_SECRET: 'another-secret-0123456789' }).call('/api/auth/me', undefined, { headers: { Cookie: `fusion_session=${good}` } })).body.signedIn, false);
  assert.equal((await c.call('/api/auth/me')).body.signedIn, true);
});

test('simulated checkout needs an account, sets the plan, and records a test payment', async () => {
  const env = mkEnv(), c = client(env);
  let r = await c.call('/api/checkout', { plan: 'adviser', interval: 'month' });
  assert.equal(r.status, 401); assert.equal(r.body.status, 'sign_in');
  await c.call('/api/auth/register', { email: 'a@b.co', password: PW });
  r = await c.call('/api/checkout', { plan: 'adviser', interval: 'month', amount: 1 });
  assert.equal(r.status, 200); assert.equal(r.body.simulated, true); assert.equal(r.body.user.tier, 'pro');
  assert.equal(c.jar.get('cpf_tier_v1'), 'pro');
  const pay = env.DB.raw.prepare('SELECT * FROM payments').get();
  assert.deepEqual([pay.plan, pay.interval, pay.amount, pay.simulated], ['adviser', 'month', 49, 1], 'price comes from the server, not the request');
  assert.equal((await c.call('/api/checkout', { plan: 'gold', interval: 'year' })).status, 400);
  // A page on another site cannot buy a plan for a signed-in visitor.
  assert.equal((await c.call('/api/checkout', { plan: 'workspace', interval: 'year' }, { headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('cancel returns to Guided; delete needs the password and removes everything', async () => {
  const env = mkEnv(), c = client(env);
  await c.call('/api/auth/register', { email: 'a@b.co', password: PW });
  await c.call('/api/checkout', { plan: 'workspace', interval: 'year' });
  const cancel = await c.call('/api/account/cancel', {});
  assert.equal(cancel.body.user.tier, 'lite'); assert.equal(c.jar.get('cpf_tier_v1'), 'lite');
  assert.equal((await c.call('/api/account/delete', { password: 'wrong password!' })).status, 401);
  assert.equal((await c.call('/api/account/delete', { password: PW })).status, 200);
  assert.equal(c.jar.has('fusion_session'), false);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: PW })).status, 401);
});

test('admin password reset is off without a token, and signs the user out everywhere when used', async () => {
  const env = mkEnv(), c = client(env);
  await c.call('/api/auth/register', { email: 'a@b.co', password: PW });
  const admin = client(env);
  assert.equal((await admin.call('/api/admin/reset-password', { email: 'a@b.co', password: 'a new password 1' }, { headers: { Authorization: 'Bearer x' } })).status, 404);
  const env2 = { ...env, ADMIN_TOKEN: 'admin-token-0123456789' };
  const ok = await client(env2).call('/api/admin/reset-password', { email: 'a@b.co', password: 'a new password 1' }, { headers: { Authorization: 'Bearer admin-token-0123456789' } });
  assert.equal(ok.status, 200);
  assert.equal((await c.call('/api/auth/me')).body.signedIn, false, 'old session ended');
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: PW })).status, 401);
  assert.equal((await c.call('/api/auth/login', { email: 'a@b.co', password: 'a new password 1' })).status, 200);
});

test('/logout also ends the account session', async () => {
  const env = mkEnv(), c = client(env);
  await c.call('/api/auth/register', { email: 'a@b.co', password: PW });
  const r = await worker.fetch(new Request(`${ORIGIN}/logout`), env);
  assert.ok(r.headers.getSetCookie().some((s) => s.startsWith('fusion_session=;') && /Max-Age=0/.test(s)));
});
