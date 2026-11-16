/**
 * Plan level unlocked on THIS DEVICE by a beta or upgrade code, kept apart from the
 * account's plan (which the server sends in the cpf_tier_v1 cookie).
 *
 *   fusion_beta_tier — set only when a code is entered (either planner)
 *   fusion_plan      — the classic planner's working plan; it is rewritten from
 *                      max(account tier, code tier) on each load, so it must not be
 *                      read back as "what the codes unlocked"
 *
 * Before accounts existed, fusion_plan only ever came from codes, so it is copied
 * into fusion_beta_tier once (migrateBetaTier).
 */
const RANK = { lite: 0, plus: 1, pro: 2 };
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

export const migrateBetaTier = () => {
  if (get('fusion_beta_migrated') === '1') return;
  if (get('fusion_beta_tier') === null && get('fusion_gate_passed') === '1') {
    const old = get('fusion_plan');
    put('fusion_beta_tier', RANK[old] !== undefined ? old : 'lite');
  }
  put('fusion_beta_migrated', '1');
};
/** Tier unlocked by codes on this device ('lite' if none). */
export const betaTier = () => { const t = get('fusion_beta_tier'); return RANK[t] !== undefined ? t : 'lite'; };
export const setBetaTier = (t) => put('fusion_beta_tier', RANK[t] !== undefined ? t : 'lite');
export const higherTier = (a, b) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);
