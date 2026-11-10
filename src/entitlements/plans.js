/**
 * Plans and prices — single source of truth for the website, the checkout page
 * and (from the payments step) the Worker. Prices are in SGD.
 *
 * Public names vs app tier ids:
 *   Guided    → 'lite'  (free)
 *   Workspace → 'plus'
 *   Adviser   → 'pro'   (per seat)
 * The app shows these public names too (TIER_NAMES in tiers.js).
 *
 * The Worker must never trust a price sent by the browser: it looks the plan
 * up here (or in Stripe) by key.
 */
export const PLANS = {
  guided: {
    key: 'guided', tier: 'lite', name: 'Guided', perSeat: false, trialDays: 0,
    price: { month: 0, year: 0 },
    highlights: [
      'CPF projection to payout age',
      'Readiness score and CPF LIFE estimate',
      'What-if sliders and plain-English warnings',
    ],
  },
  workspace: {
    key: 'workspace', tier: 'plus', name: 'Workspace', perSeat: false, trialDays: 0,
    price: { month: 9, year: 79 },
    highlights: [
      'Everything in Guided',
      'Strategy tools: Goal Simulator, Turbocharger, Tax Optimizer',
      'Stress Centre, Monte Carlo and life events',
      'CPF LIFE plan comparison, Compare and Household',
      'Data Table, cashflow ledger, CSV and PDF export',
    ],
  },
  adviser: {
    key: 'adviser', tier: 'pro', name: 'Adviser', perSeat: true, trialDays: 14,
    price: { month: 49, year: 468 },
    highlights: [
      'Everything in Workspace, licensed for client work',
      'Share links and PDF reports for client meetings',
      'Priority support and early access to the client workspace',
    ],
  },
};

export const PAID_PLAN_KEYS = ['workspace', 'adviser'];

export const priceFor = (key, interval) => PLANS[key]?.price[interval === 'month' ? 'month' : 'year'] ?? null;

/** Percentage saved by paying yearly instead of 12 × monthly (rounded to the nearest whole percent). */
export const savingsPct = (key) => {
  const p = PLANS[key]?.price;
  if (!p || !p.month) return 0;
  return Math.round((1 - p.year / (p.month * 12)) * 100);
};
