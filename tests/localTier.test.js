// Code-unlocked tier vs account tier on the device.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { migrateBetaTier, betaTier, setBetaTier, higherTier } = await import('../src/entitlements/localTier.js');

test('codes entered before accounts existed are kept once, and only once', () => {
  store.clear(); store.set('fusion_gate_passed', '1'); store.set('fusion_plan', 'plus');
  migrateBetaTier();
  assert.equal(betaTier(), 'plus');
  // Later, the classic planner copies an account tier into fusion_plan: that must not become a code tier.
  setBetaTier('lite'); store.set('fusion_plan', 'pro'); migrateBetaTier();
  assert.equal(betaTier(), 'lite');
});

test('no code entered means Guided; unknown values are ignored', () => {
  store.clear(); migrateBetaTier();
  assert.equal(betaTier(), 'lite');
  store.set('fusion_beta_tier', 'gold'); assert.equal(betaTier(), 'lite');
  assert.equal(higherTier('plus', 'lite'), 'plus'); assert.equal(higherTier('lite', 'pro'), 'pro');
});
