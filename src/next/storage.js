/**
 * Browser storage and hand-off for the new planner. Everything stays on this device.
 *   fusion_guided_plan_v1 — the answers from setup plus what-if changes
 *   fusion_gate_passed / fusion_plan — shared with the classic planner, so one access code covers both
 */
import { encodePlanState } from '../state/shareLink.js';
import { toEngineInputs } from '../model/plan.js';
import { cleanState, cleanBook } from '../model/clients.js';
import { migrateBetaTier, betaTier, setBetaTier, higherTier } from '../entitlements/localTier.js';

migrateBetaTier(); // once per device: codes entered before accounts existed

export { cleanState };

const PLAN_KEY = 'fusion_guided_plan_v1';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Saved plan, or null on first visit. Unknown or badly typed fields are dropped. */
export const loadPlan = () => {
  try {
    const raw = JSON.parse(get(PLAN_KEY) || 'null');
    return raw && typeof raw === 'object' && raw.answers ? cleanState(raw) : null;
  } catch { return null; }
};
export const savePlan = (state) => set(PLAN_KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), ...state }));
export const clearPlan = () => set(PLAN_KEY, null);

/** Access: the Worker's tier cookie, or a code entered earlier on this device. */
/**
 * Plan level on this device: the higher of the account's tier (cpf_tier_v1 cookie, set by
 * the server) and any code entered here (fusion_beta_tier). null = not signed in, no code.
 */
export const currentTier = () => {
  let cookieTier = null;
  try {
    const m = document.cookie.match(/(?:^|;\s*)cpf_tier_v1=([^;]+)/);
    if (m && ['lite', 'plus', 'pro'].includes(m[1])) cookieTier = m[1];
  } catch { /* no cookies */ }
  const passed = get('fusion_gate_passed') === '1';
  if (!cookieTier && !passed) return null;
  const code = passed ? betaTier() : 'lite';
  return cookieTier ? higherTier(cookieTier, code) : code;
};
export const rememberTier = (tier) => {
  set('fusion_gate_passed', '1');
  setBetaTier(tier);
  set('fusion_plan', tier === 'lite' ? null : tier); // read by the classic planner
};

export const getTheme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
export const setTheme = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
  set('cpf_theme', mode);
};

/** Link that opens the classic planner with this plan loaded. */
export const classicLink = (answers, now = new Date()) =>
  `/app/classic/?p=${encodePlanState(JSON.stringify({ appVersion: 'V4-2026', inputs: toEngineInputs(answers, now) }))}`;

/* ── Adviser: client files, kept on this device (shape and checks in src/model/clients.js) ── */
const CLIENTS_KEY = 'fusion_clients_v1';
export const loadBook = () => { try { return cleanBook(JSON.parse(get(CLIENTS_KEY) || 'null')); } catch { return cleanBook(null); } };
/** Returns false when the browser refuses to store the book (usually: storage is full). */
export const saveBook = (book) => { try { localStorage.setItem(CLIENTS_KEY, JSON.stringify({ v: 2, ...book })); return true; } catch { return false; } };
export const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Download text as a file (CSV, JSON backup). */
export const download = (name, text, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Sign out: forget the access code on this device (saved plans and client files stay), then clear the cookies. */
export const signOut = () => {
  set('fusion_gate_passed', null); set('fusion_plan', null); set('fusion_beta_tier', null);
  window.location.assign('/logout');
};

/* ── Accounts (proof of concept) ─────────────────────────────────────────────
   The server holds the account and its plan; it also sets the readable cpf_tier_v1
   cookie, which currentTier() above combines with any beta code on this device. */
const post = async (path, body = {}) => {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  } catch { return { ok: false, status: 0, message: 'No connection. Please try again.' }; }
};
/** { available, signedIn, user } — available is false when the server has no accounts set up (or is unreachable). */
export const fetchAccount = async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 503 || !res.ok) return { available: false, signedIn: false, user: null };
    const data = await res.json();
    return { available: true, signedIn: !!data.signedIn, user: data.user || null };
  } catch { return { available: false, signedIn: false, user: null }; }
};
export const accountApi = {
  register: (email, password) => post('/api/auth/register', { email, password }),
  login: (email, password) => post('/api/auth/login', { email, password }),
  cancelPlan: () => post('/api/account/cancel'),
  deleteAccount: (password) => post('/api/account/delete', { password }),
};
