/**
 * Plan tiers and feature gating (client-side; server-side checks arrive with accounts + payments).
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// Public plan names. Internal tier ids ('lite' | 'plus' | 'pro') are unchanged —
// they are stored in localStorage ('fusion_plan') and used by every lock check.
// Names must match src/entitlements/plans.js and the website.
export const TIER_NAMES = { lite: 'Guided', plus: 'Workspace', pro: 'Adviser' };
export const TIER_BADGE = { lite: 'GUIDED', plus: 'WORKSPACE', pro: 'ADVISER' };
export const tierName = (id) => TIER_NAMES[id] ?? 'Workspace';

// TIER_CONFIG drives the plan pill colour, label, and tooltip.
// Keyed by plan.toUpperCase() — synced with the plan React state in CPFPlannerApp.
export const TIER_CONFIG = {
  LITE: { label: TIER_BADGE.lite, bg: '#0369a1', color: '#ffffff',
          border: 'rgba(3,105,161,0.6)',  anim: 'none',
          title: 'Fusion 富生 Guided (free) — your CPF projection, readiness score and what-if tools. Upgrade for the full planning toolkit.' },
  PLUS: { label: TIER_BADGE.plus, bg: '#d97706', color: '#ffffff',
          border: 'rgba(217,119,6,0.5)', anim: 'none',
          title: 'Fusion 富生 Workspace — the full planning toolkit: strategy, stress tests, Monte Carlo, payout plans, Compare, Household and Data Table.' },
  PRO:  { label: TIER_BADGE.pro,  bg: '#b45309', color: '#fef3c7',
          border: 'rgba(180,83,9,0.5)',  anim: 'none',
          title: 'Fusion 富生 Adviser — everything in Workspace, licensed for client work.' },
};

// ── Plan gate helpers ────────────────────────────────────────────────────────────
// Tiers: 'lite' = Guided (free) → 'plus' = Workspace → 'pro' = Adviser
export const PLAN_REQUIRED_TABS = {
  payout:  'plus',  // full CPF LIFE / RSS payout analysis (Guided shows the estimate on the Plan tab)
  compare: 'plus',  // saved-scenario comparison + Household
  // Sub-views gated at their toggles: Plan › Strategy and Docs & Data › Data Table → 'plus'
};

export const PLAN_RANK = { lite: 0, plus: 1, pro: 2 };

export const tabIsLocked = (tabId, plan) => {
  const req = PLAN_REQUIRED_TABS[tabId];
  if (!req) return false;
  return (PLAN_RANK[plan] ?? 0) < (PLAN_RANK[req] ?? 99);
};

// Sidebar sections locked per plan tier
export const SECTION_PLAN = {
  cashBudget:      'plus', familyEvents: 'plus', topups:    'plus',
  transfers:       'plus', outflows:     'plus', retirement:   'plus',
  portfolio:       'plus',  property:     'plus',
  privateAssets:   'plus',  lifeevents:   'plus',
};

export const sectionIsLocked = (sectionId, plan) => {
  const req = SECTION_PLAN[sectionId];
  if (!req) return false;
  return (PLAN_RANK[plan] ?? 0) < (PLAN_RANK[req] ?? 99);
};

// Preset IDs accessible on Guided ('lite', free)
export const LITE_PRESET_IDS = new Set(["blank", "typical35"]);
