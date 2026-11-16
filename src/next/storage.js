/**
 * Browser storage and hand-off for the new planner. Everything stays on this device.
 *   fusion_guided_plan_v1 — the answers from setup plus what-if changes
 *   fusion_gate_passed / fusion_plan — shared with the classic planner, so one access code covers both
 */
import { encodePlanState } from '../state/shareLink.js';
import { toEngineInputs } from '../model/plan.js';
import { cleanState, cleanBook } from '../model/clients.js';

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
export const currentTier = () => {
  let cookieTier = null;
  try {
    const m = document.cookie.match(/(?:^|;\s*)cpf_tier_v1=([^;]+)/);
    if (m && ['lite', 'plus', 'pro'].includes(m[1])) cookieTier = m[1];
  } catch { /* no cookies */ }
  const stored = get('fusion_plan');
  const passed = get('fusion_gate_passed') === '1';
  if (!cookieTier && !passed) return null;
  const rank = { lite: 0, plus: 1, pro: 2 };
  const storedTier = rank[stored] !== undefined ? stored : 'lite';
  return cookieTier && rank[cookieTier] > rank[storedTier] ? cookieTier : storedTier;
};
export const rememberTier = (tier) => {
  set('fusion_gate_passed', '1');
  set('fusion_plan', tier === 'lite' ? null : tier);
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
  set('fusion_gate_passed', null); set('fusion_plan', null);
  window.location.assign('/logout');
};
