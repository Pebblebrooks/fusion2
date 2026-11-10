/**
 * Beta access codes — shared by the new planner (/app/) and the classic planner (/app/classic/).
 *
 * SECURITY: these ship to the browser, so anyone can read them. They only keep casual
 * visitors out during the private beta. Replace with server-side sign-in and plan checks
 * (accounts + payments step) before public launch.
 *
 *   GATE_PASSWORDS — first-launch access screen. admin → Adviser ('pro'), beta → Guided ('lite').
 *   TIER_PASSWORDS — upgrade dialog once inside the app.
 */
export const GATE_PASSWORDS = {
  admin: 'Admin$$1188$$',
  beta:  'Beta$$2026$$',
};
export const TIER_PASSWORDS = {
  plus: 'BetaPlus$$2026$$',
  pro:  'BetaPro$$2026$$',
};

/** Returns the tier a code unlocks at the gate ('pro' | 'lite'), or null. */
export const tierForGateCode = (code) =>
  code === GATE_PASSWORDS.admin ? 'pro' : code === GATE_PASSWORDS.beta ? 'lite' : null;

/** Returns the tier an upgrade code unlocks ('plus' | 'pro'), or null. */
export const tierForUpgradeCode = (code) =>
  code === TIER_PASSWORDS.pro || code === GATE_PASSWORDS.admin ? 'pro' : code === TIER_PASSWORDS.plus ? 'plus' : null;
