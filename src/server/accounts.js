/**
 * Accounts for the proof of concept: email + password, signed session cookie,
 * plan tier held on the server, and a SIMULATED checkout (no payment provider).
 * Runs in the Cloudflare Worker only.
 *
 * Needs:
 *   env.DB              — D1 database binding (wrangler.jsonc → d1_databases)
 *   env.SESSION_SECRET  — Worker secret used to sign session cookies
 * Optional:
 *   env.ADMIN_TOKEN        — enables POST /api/admin/reset-password
 *   env.PBKDF2_ITERATIONS  — password hashing cost for NEW passwords (default 100000,
 *                            the most Workers allow). Lower it only if sign-in hits the CPU limit.
 * If DB or SESSION_SECRET is missing, every account route answers 503 'unavailable'
 * and the site behaves as before (beta codes only).
 *
 * Cookies set here:
 *   fusion_session — HttpOnly, signed: { uid, gen, exp }. `gen` lets us end all of a
 *                    user's sessions (password reset, account deletion).
 *   cpf_tier_v1    — readable by page scripts: the account's tier, so both planners
 *                    and the website header see it. Display only; the server decides.
 */
import { PLANS, PAID_PLAN_KEYS, priceFor } from '../entitlements/plans.js';

export const SESSION_COOKIE = 'fusion_session';
export const TIER_COOKIE = 'cpf_tier_v1';
const SESSION_DAYS = 30;
const MAX_FAILED = 10, LOCK_MINUTES = 15;
const MIN_PASSWORD = 10, MAX_PASSWORD = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const enc = new TextEncoder();

/* ── Small helpers ────────────────────────────────────────────────────────── */
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
/** Constant-time string comparison. */
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
export const normaliseEmail = (e) => String(e ?? '').trim().toLowerCase();

const json = (body, status = 200, cookies = []) => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};
const readCookie = (request, name) => {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
};
const cookie = (name, value, maxAge, httpOnly) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`;
export const clearAccountCookies = () => [cookie(SESSION_COOKIE, '', 0, true), cookie(TIER_COOKIE, '', 0, false)];

/* ── Passwords (PBKDF2-SHA-256, per-user salt and iteration count) ────────── */
const iterationsFor = (env) => {
  const n = Number(env.PBKDF2_ITERATIONS);
  return Number.isInteger(n) && n >= 10000 && n <= 100000 ? n : 100000;
};
export async function hashPassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
  return hex(bits);
}

/* ── Sessions (HMAC-SHA-256 signed) ───────────────────────────────────────── */
const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${sig}`;
}
async function verify(token, secret) {
  if (!token || token.length > 1000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  if (!same(sig, expect)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return p && typeof p.uid === 'string' && Number.isInteger(p.gen) && p.exp > Date.now() ? p : null;
  } catch { return null; }
}
async function sessionCookies(user, env) {
  const token = await sign({ uid: user.id, gen: user.session_gen, exp: Date.now() + SESSION_DAYS * 864e5 }, env.SESSION_SECRET);
  return [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, true), cookie(TIER_COOKIE, user.plan, SESSION_DAYS * 86400, false)];
}

/* ── Database ─────────────────────────────────────────────────────────────── */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
     pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_iter INTEGER NOT NULL,
     plan TEXT NOT NULL DEFAULT 'lite', plan_interval TEXT, plan_since TEXT,
     created_at TEXT NOT NULL, failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
     session_gen INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS payments (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, interval TEXT NOT NULL,
     amount INTEGER NOT NULL, simulated INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id)',
];
const ready = new WeakSet(); // databases whose tables have been created in this Worker instance
async function db(env) {
  if (!ready.has(env.DB)) {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    ready.add(env.DB);
  }
  return env.DB;
}
export const available = (env) => !!(env && env.DB && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 16);

/** The signed-in user, or null. Sessions end when the user's session_gen changes. */
export async function currentUser(request, env) {
  if (!available(env)) return null;
  const p = await verify(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
  if (!p) return null;
  const u = await (await db(env)).prepare('SELECT * FROM users WHERE id = ?').bind(p.uid).first();
  return u && u.session_gen === p.gen ? u : null;
}
const publicUser = (u) => ({ email: u.email, tier: u.plan, planName: Object.values(PLANS).find((p) => p.tier === u.plan)?.name || 'Guided', interval: u.plan_interval || null, since: u.plan_since || null });

async function readBody(request) {
  if (request.method !== 'POST') return { error: json({ ok: false, message: 'Method not allowed' }, 405) };
  // Only same-site pages may call these routes (blocks cross-site form posts).
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return { error: json({ ok: false, message: 'Not allowed' }, 403) };
  try { return { body: (await request.json()) || {} }; } catch { return { error: json({ ok: false, message: 'Invalid request' }, 400) }; }
}
const checkPassword = (pw) => (typeof pw !== 'string' || pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.`
  : pw.length > MAX_PASSWORD ? 'That password is too long.' : null);

/* ── Route handlers ───────────────────────────────────────────────────────── */
async function register(request, env) {
  const { body, error } = await readBody(request); if (error) return error;
  const email = normaliseEmail(body.email), password = body.password;
  if (!EMAIL_RE.test(email) || email.length > 200) return json({ ok: false, message: 'Enter a valid email address.' }, 400);
  const bad = checkPassword(password); if (bad) return json({ ok: false, message: bad }, 400);
  const d = await db(env);
  if (await d.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
    return json({ ok: false, message: 'An account with that email already exists. Sign in instead.' }, 409);
  }
  const salt = randomHex(16), iter = iterationsFor(env);
  const user = { id: `u_${randomHex(12)}`, email, plan: 'lite', session_gen: 0 };
  await d.prepare('INSERT INTO users (id, email, pw_hash, pw_salt, pw_iter, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, email, await hashPassword(password, salt, iter), salt, iter, 'lite', new Date().toISOString()).run();
  return json({ ok: true, user: publicUser(user) }, 201, await sessionCookies(user, env));
}

async function login(request, env) {
  const { body, error } = await readBody(request); if (error) return error;
  const email = normaliseEmail(body.email), password = String(body.password ?? '');
  const d = await db(env);
  const u = await d.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const wrong = json({ ok: false, message: 'Email or password is not right.' }, 401);
  if (!u) { await hashPassword(password, 'no-such-user', iterationsFor(env)); return wrong; } // same work either way
  const now = Date.now();
  if (u.locked_until > now) {
    return json({ ok: false, message: `Too many attempts. Try again in ${Math.ceil((u.locked_until - now) / 60000)} minutes.` }, 429);
  }
  if (!same(await hashPassword(password, u.pw_salt, u.pw_iter), u.pw_hash)) {
    const failed = u.failed + 1, lock = failed >= MAX_FAILED ? now + LOCK_MINUTES * 60000 : 0;
    await d.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : failed, lock, u.id).run();
    return lock ? json({ ok: false, message: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` }, 429) : wrong;
  }
  if (u.failed || u.locked_until) await d.prepare('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').bind(u.id).run();
  return json({ ok: true, user: publicUser(u) }, 200, await sessionCookies(u, env));
}

async function me(request, env) {
  const u = await currentUser(request, env);
  // Refresh the readable tier cookie so the planners always see the server's answer.
  return u ? json({ ok: true, signedIn: true, user: publicUser(u) }, 200, [cookie(TIER_COOKIE, u.plan, SESSION_DAYS * 86400, false)])
    // Not signed in: a leftover tier cookie no longer means anything, so remove it.
    : json({ ok: true, signedIn: false }, 200, readCookie(request, TIER_COOKIE) ? [cookie(TIER_COOKIE, '', 0, false)] : []);
}

/** SIMULATED checkout: records a test payment and sets the plan. No money moves. */
export async function simulatedCheckout(request, env, order) {
  const u = await currentUser(request, env);
  if (!u) return json({ ok: false, status: 'sign_in', message: 'Sign in or create an account first.' }, 401);
  const plan = PLANS[order.plan];
  await (await db(env)).batch([
    env.DB.prepare('INSERT INTO payments (id, user_id, plan, interval, amount, simulated, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .bind(`p_${randomHex(12)}`, u.id, plan.key, order.interval, priceFor(plan.key, order.interval), new Date().toISOString()),
    env.DB.prepare('UPDATE users SET plan = ?, plan_interval = ?, plan_since = ? WHERE id = ?')
      .bind(plan.tier, order.interval, new Date().toISOString(), u.id),
  ]);
  const user = { ...u, plan: plan.tier, plan_interval: order.interval };
  return json({ ok: true, simulated: true, user: publicUser(user), url: '/app/?welcome=paid' }, 200, await sessionCookies(user, env));
}

async function cancelPlan(request, env) {
  const { error } = await readBody(request); if (error) return error;
  const u = await currentUser(request, env);
  if (!u) return json({ ok: false, status: 'sign_in', message: 'Please sign in again.' }, 401);
  await (await db(env)).prepare("UPDATE users SET plan = 'lite', plan_interval = NULL, plan_since = NULL WHERE id = ?").bind(u.id).run();
  const user = { ...u, plan: 'lite', plan_interval: null, plan_since: null };
  return json({ ok: true, user: publicUser(user) }, 200, await sessionCookies(user, env));
}

async function deleteAccount(request, env) {
  const { body, error } = await readBody(request); if (error) return error;
  const u = await currentUser(request, env);
  if (!u) return json({ ok: false, status: 'sign_in', message: 'Please sign in again.' }, 401);
  if (!same(await hashPassword(String(body.password ?? ''), u.pw_salt, u.pw_iter), u.pw_hash)) {
    return json({ ok: false, message: 'That password is not right.' }, 401);
  }
  await (await db(env)).batch([
    env.DB.prepare('DELETE FROM payments WHERE user_id = ?').bind(u.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id),
  ]);
  return json({ ok: true }, 200, clearAccountCookies());
}

/** Admin: set a new password for a user who has forgotten theirs. Off unless ADMIN_TOKEN is set. */
async function adminReset(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 16 || !same(token, env.ADMIN_TOKEN)) return json({ ok: false, message: 'Not found' }, 404);
  const { body, error } = await readBody(request); if (error) return error;
  const bad = checkPassword(body.password); if (bad) return json({ ok: false, message: bad }, 400);
  const d = await db(env), email = normaliseEmail(body.email);
  const u = await d.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!u) return json({ ok: false, message: 'No account with that email.' }, 404);
  const salt = randomHex(16), iter = iterationsFor(env);
  // Raising session_gen signs the user out everywhere.
  await d.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iter = ?, failed = 0, locked_until = 0, session_gen = session_gen + 1 WHERE id = ?')
    .bind(await hashPassword(body.password, salt, iter), salt, iter, u.id).run();
  return json({ ok: true });
}

const ROUTES = {
  '/api/auth/register': register, '/api/auth/login': login, '/api/auth/me': me,
  '/api/account/cancel': cancelPlan, '/api/account/delete': deleteAccount, '/api/admin/reset-password': adminReset,
};
export const isAccountRoute = (path) => Object.hasOwn(ROUTES, path) || path === '/api/auth/logout';

export async function handleAccount(request, env, path) {
  if (path === '/api/auth/logout') return json({ ok: true }, 200, clearAccountCookies());
  if (!available(env)) return json({ ok: false, status: 'unavailable', message: 'Accounts are not available yet.' }, 503);
  try {
    return await ROUTES[path](request, env);
  } catch (e) {
    console.error('account route failed', path, e && e.message);
    return json({ ok: false, message: 'Something went wrong. Please try again.' }, 500);
  }
}

export { PAID_PLAN_KEYS };
