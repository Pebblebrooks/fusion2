/**
 * Shared engine helpers: salary growth factor, life stage, BALA table, engine init, seeded RNG.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */
import { CPF_RATES, SRS_CAP_FOREIGNER, SRS_CAP_SC_PR } from '../policy/cpf2026.js';

// ── makeComputeGF ─────────────────────────────────────────────────────────────
// BUG-10 fix: computeGF was defined identically inside both runRSSEngine and
// runProjectionEngine. Extracted here as a factory so a single source of truth
// exists — any future change to phase-salary or growth logic only needs one edit.
//
// Returns a function (age, bump=0) → growth factor that:
//   Phase 1 (age < phaseAge or no phase): (1 + r1)^(age − startAge)
//   Phase 2 (age ≥ phaseAge):            (1 + r1)^(phaseAge − startAge)
//                                       × (1 + r2)^(age − phaseAge)
// bump is a fractional one-year bonus adjustment (used for AW/bonus contributions).
// Contribution zeroing during career breaks is handled upstream via leContribPaused
// before computeGF is called — this function only handles salary growth scaling.
export function makeComputeGF(startAge, salaryGrowth, salaryPhaseAge, salaryGrowthRate2) {
  return function computeGF(age, bump = 0) {
    const yearsTotal = Math.max(0, age - startAge);
    let gfVal;
    if (salaryPhaseAge !== null && age >= salaryPhaseAge) {
      const years1 = Math.max(0, salaryPhaseAge - startAge);
      const years2 = Math.max(0, age - salaryPhaseAge);
      gfVal = Math.pow(1 + salaryGrowth, years1) * Math.pow(1 + salaryGrowthRate2, years2);
    } else {
      gfVal = Math.pow(1 + salaryGrowth, yearsTotal);
    }
    return gfVal * (1 + bump);
  };
}

// ─── B0: CPF cohort-average overlay ────────────────────────────────────────
// BALA_CURVE: CPF Board cohort-average TOTAL CPF balance by age (2026 cohort).
// IMPORTANT — DISTINCT from BALA_TABLE below (which is the SLA HDB leasehold
// decay curve for property valuation). The shared 'Bala' name is coincidental.
export const BALA_CURVE = [
  { age: 25, val:  12000 }, { age: 30, val:  42000 }, { age: 35, val:  88000 },
  { age: 40, val: 148000 }, { age: 45, val: 215000 }, { age: 50, val: 268000 },
  { age: 55, val: 295000 }, { age: 60, val: 248000 }, { age: 65, val: 185000 },
];

// ─── Life-stage framework ────────────────────────────────────────────────────
// Drives the dismissible banner shown in the Dashboard tab header.
export const LIFE_STAGE_MAP = [
  { maxAge:  29, label: 'Early Career',   color: '#1D9E75',
    tip: 'Build OA for housing, start SA for retirement, emergency fund.' },
  { maxAge:  44, label: 'Mid-Career',     color: '#185FA5',
    tip: 'Maximise RSTU, reduce housing outflow, review investment strategy.' },
  { maxAge:  54, label: 'Pre-Retirement', color: '#7F77DD',
    tip: 'Fill FRS, review CPF LIFE plan, SRS top-up for tax savings.' },
  { maxAge:  64, label: 'Transition',     color: '#BA7517',
    tip: 'OA drawdown strategy, SRS depletion plan, property monetisation.' },
  { maxAge: 999, label: 'Retirement',     color: '#D85A30',
    tip: 'Income sustainability, estate planning, legacy documents.' },
];

export const getLifeStage = (age) =>
  LIFE_STAGE_MAP.find(s => age <= s.maxAge) || LIFE_STAGE_MAP[LIFE_STAGE_MAP.length - 1];

// ─── B1: Bala's Curve / SLA Leasehold Value Table ────────────────────────────
// Leasehold property value as a % of equivalent freehold value, indexed by
// remaining lease years.  Official SLA anchor points (Singapore Land Authority):
//   0yr=0%  1yr=2%  15yr=40%  30yr=60%  60yr=80%  90yr=92%  99yr=96%
// Intermediate values use piecewise-linear interpolation between these anchors.
// Reference: Singapore Land Authority Leasehold Table (Bala's Curve, 2000).
export const BALA_TABLE = (() => {
  const anchors = [[0, 0], [1, 2], [15, 40], [30, 60], [60, 80], [90, 92], [99, 96]];
  const tbl = new Array(100).fill(0);
  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, v0] = anchors[i];
    const [y1, v1] = anchors[i + 1];
    for (let y = y0; y <= y1; y++) {
      // Round to 1 decimal to match SLA table precision
      tbl[y] = Math.round((v0 + ((y - y0) / (y1 - y0)) * (v1 - v0)) * 10) / 10;
    }
  }
  return tbl; // tbl[n] = % of freehold value for n remaining lease years
})();

// Returns Bala ratio (0–1) for given remaining lease years.
// Examples: balaRatio(99)=0.96  balaRatio(60)=0.80  balaRatio(30)=0.60  balaRatio(15)=0.40
export const balaRatio = (remainingYears) => {
  const y = Math.max(0, Math.min(99, Math.round(remainingYears)));
  return BALA_TABLE[y] / 100;
};

// ── Shared engine initialisation ─────────────────────────────────────────────
// Variables required by BOTH runRSSEngine and runProjectionEngine with identical
// logic. Defined once here — adding a future shared variable requires ONE edit.
// Call pattern in each engine: const { srsCap, _oaRateBase, ... } = _cpfEngineInit(inputs);
export function _cpfEngineInit(inputs) {
  const _c = (inputs.citizenStatus || 'SC').toLowerCase();
  return {
    // SRS annual contribution cap: foreigners $35,700/yr; SC/PR $15,300/yr (POL-3 / BUG-9)
    srsCap:      _c === 'foreigner' ? SRS_CAP_FOREIGNER : SRS_CAP_SC_PR,
    // Deterministic CPF rate bases — override CPF_RATES.OA/SA/MA when stress-testing.
    // Monte Carlo rateNoise is layered on top inside each engine loop (Item 5).
    _oaRateBase: (inputs.cpfOARateOverride != null && inputs.cpfOARateOverride !== '') ? Number(inputs.cpfOARateOverride) / 100 : CPF_RATES.OA,
    _saRateBase: (inputs.cpfSARateOverride != null && inputs.cpfSARateOverride !== '') ? Number(inputs.cpfSARateOverride) / 100 : CPF_RATES.SA,
    _maRateBase: (inputs.cpfMARateOverride != null && inputs.cpfMARateOverride !== '') ? Number(inputs.cpfMARateOverride) / 100 : CPF_RATES.MA,
  };
}

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
// Deterministic pseudo-random number generator seeded by profile inputs.
// Used in Monte Carlo so P10/P90 bands are consistent across sessions for the
// same profile. Seed changes when currentAge or payoutAge changes.
export function seededRandom(seed) {
  let s = (seed >>> 0) + 1;   // +1 avoids degenerate seed=0 case
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0xd35a2d97) >>> 0);
    s = (Math.imul(s ^ (s >>> 13), 0x96556abd) >>> 0);
    return ((s ^ (s >>> 12)) >>> 0) / 0xFFFFFFFF;
  };
}
