/**
 * CPF LIFE payout tables, interpolation and Basic-plan mechanics.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// ── CPF LIFE 2026 Payout Reference Dataset ──────────────────────────────────
// Source: CPF Board Monthly Payout Estimator (2026 cohort, male, payout age 65).
// CPF Board does not publish exact actuarial/mortality formulas — industry standard
// is to use verified Estimator data points with linear interpolation between them.
// Escalating ≈ 80% of Standard; Basic ≈ 92% of Standard (confirmed across all RA levels).
// Female: apply 0.93 multiplier to male figures (longer life expectancy).
// D4-Bug2 fix (2026-05): table keys corrected to full RA at payout age (BEFORE the RA→OA transfer).
// CPF Board's published reference table/Estimator present headline payout figures assuming the
// member does NOT exercise the optional withdrawal — i.e. the full RA funds the CPF LIFE premium.
// That's a valid calibration choice (see consistency check below), but it is NOT a general policy
// fact that the transfer "does not reduce payout": per CPF Board, the withdrawable portion is
// excluded from the premium by default unless the member instructs CPF Board to use it toward
// their payout instead — so withdrawing it absolutely does lower the payout basis. This table's
// full-RA keying should be read as "the no-withdrawal scenario", not as evidence the transfer is
// payout-neutral. (Earlier wording here caused a real bug: a Dashboard notice box stated the
// transfer "does not reduce payout basis" unconditionally — fixed; see raOaTransfer notice JSX.)
// Annuity rates across all data points confirm the full-RA keying is the right LOOKUP basis:
//   RA $65k  age 65 → $400 std → 7.38%/yr  (on full RA)
//   RA $560k age 65 → $2,990 std → 6.41%/yr (on full RA)
//   Rate on post-transfer RA would be 8.08% / 7.92% — inconsistent, confirming full RA is correct.
//
// Key sources:
//   • Official CPF Board reference table (cpf.gov.sg "How much payout?", 2026):
//     RA@55=$50k → RA@65=$82.4k → $490; … ERS $440.8k→$650.1k → $3,440
//   • CPF LIFE Estimator (2026): YOB 1971 RA=$65k age 65 → $400; YOB 1963 RA=$560k age 65 → $2,990
//
// Table key = full projected RA at payout age (column "RA@65" from CPF table, or RA from estimator).
// The esc and bas payout ratios (≈80% and ≈92% of std) are CPF LIFE plan-design constants.
//
// Known limitation: the table is calibrated at payout age 65. For members deferring to 66-70,
// the actuarial rate rises (~6.5-7.0%/yr) so payouts are modestly understated (−$55 to −$381/mo).
// The payout-age dimension would require a 2-D table; deferred to a future update.
export const CPF_LIFE_TABLE_M = [
  { ra:  65000, std:  400, esc:  320, bas:  370 }, // CPF estimator: YOB 1971 RA=$65k age 65
  { ra:  82400, std:  490, esc:  390, bas:  450 }, // CPF table: RA@55=$50k → RA@65=$82.4k
  { ra: 170100, std:  950, esc:  760, bas:  880 }, // BRS: RA@55=$110.2k → RA@65=$170.1k
  { ra: 227900, std: 1250, esc: 1000, bas: 1150 }, // RA@55=$150k → RA@65=$227.9k
  { ra: 330100, std: 1780, esc: 1420, bas: 1640 }, // FRS: RA@55=$220.4k → RA@65=$330.1k
  { ra: 445600, std: 2380, esc: 1900, bas: 2190 }, // RA@55=$300k → RA@65=$445.6k
  { ra: 560000, std: 2990, esc: 2360, bas: 2730 }, // CPF estimator: YOB 1963 RA=$560k age 65
  { ra: 650100, std: 3440, esc: 2750, bas: 3160 }, // ERS: RA@55=$440.8k → RA@65=$650.1k
];

export const FEMALE_PAYOUT_MULTIPLIER = 0.93;

/**
 * RA balance that CPF LIFE payouts are based on: the balance on the payout-age birthday.
 * Projection rows close on the NEXT birthday (row `age 65` ends at the 66th birthday), so the
 * payout lookup must use the row's opening balance (`raStart`), not its closing balance (`ra`).
 * Using the closing balance added a year of interest and overstated payouts by about 5%
 * against CPF Board's published estimates (FRS at 55 → $1,780 a month from 65, 2026 cohort).
 */
export const raAtPayoutStart = (row) => (row ? (row.raStart ?? row.ra ?? 0) : 0);

// ── CPF LIFE Deferral Bonus Multipliers ──────────────────────────────────────
// Source: CPF Board Estimator (2026 cohort) — YOB 1971 (RA $65–90k) and YOB 1963
// (RA $560–690k) at payout ages 65–70 across Standard, Escalating, Basic plans.
// Each value = (CPF Estimator actual payout at deferred age) / (interpolateCpfLife
// output using the age-65 table alone). This corrects the actuarial premium from a
// shorter payout horizon — a gain ABOVE the RA growth already captured by using
// the projected RA at the deferred payout age as the interpolation key.
// Index 0 = age 65 (no deferral → 1.0×); index 5 = age 70.
// Max residual after applying: ±19/mo on high-RA profiles, ±3/mo on low-RA profiles
// — within CPF Board rounding conventions. Calibrated May 2026.
// CPF_LIFE_DEFERRAL_MULT: actuarial payout multiplier for each year of deferral beyond age 65.
// Index 0 = age 65 (baseline 1.0), index 5 = age 70 (CPF estimator cap), index 6–15 = ages 71–80.
// Ages 65–70 (indices 0–5): sourced from CPF Board Estimator 2026 data.
// Ages 71–80 (indices 6–15): actuarially derived — shorter remaining life expectancy at later migration
// ages means each RA dollar funds fewer years of payout, so the monthly annuity rises. The increment
// steepens beyond age 70 (~+0.028/yr at 71 → ~+0.055/yr at 80) reflecting the accelerating
// shortening of the payout horizon as the member approaches typical mortality.
// These are used exclusively for RSS→CPF LIFE migrations (ages >70) which CPF allows up to age 80.
export const CPF_LIFE_DEFERRAL_MULT = {
  std: [1.0000, 1.0137, 1.0403, 1.0525, 1.0763, 1.0996,
        1.1280, 1.1575, 1.1885, 1.2215, 1.2570, 1.2955, 1.3375, 1.3840, 1.4355, 1.4930],
  esc: [1.0000, 1.0250, 1.0495, 1.0716, 1.0929, 1.1145,
        1.1375, 1.1620, 1.1880, 1.2160, 1.2460, 1.2785, 1.3140, 1.3530, 1.3960, 1.4435],
  bas: [1.0000, 1.0161, 1.0322, 1.0486, 1.0750, 1.0886,
        1.1140, 1.1415, 1.1710, 1.2030, 1.2375, 1.2750, 1.3160, 1.3615, 1.4120, 1.4680],
};

// Phase 1B trigger age: age when RA_Retained drops below $60K and payout slope begins.
// Source: CPF LIFE Basic Plan documentation (2026 cohort estimates).
// Members with larger RA stay in Phase 1A longer before Phase 1B slope begins.
export const BASIC_PHASE1B_TRIGGER = [
  { ra:  100000, triggerAge: 73 },
  { ra:  150000, triggerAge: 78 },
  { ra:  200000, triggerAge: 81 },
  { ra:  300000, triggerAge: 85 },
  { ra:  400000, triggerAge: 87 },
  { ra:  500000, triggerAge: 88 },
];

// Interpolate Phase 1B trigger age for a given RA and payout start age.
// pAge offset: deferring payout means RA is larger AND Phase 1A lasts longer.
export const interpolatePhase1bTrigger = (raBalance, pAge) => {
  const tbl = BASIC_PHASE1B_TRIGGER;
  let baseAge;
  if (raBalance <= tbl[0].ra) {
    baseAge = tbl[0].triggerAge - (tbl[0].ra - raBalance) / tbl[0].ra * 4;
  } else if (raBalance >= tbl[tbl.length-1].ra) {
    baseAge = Math.min(89, tbl[tbl.length-1].triggerAge + (raBalance - tbl[tbl.length-1].ra) / 100000);
  } else {
    let lo = tbl[0], hi = tbl[1];
    for (let i = 0; i < tbl.length-1; i++) {
      if (raBalance >= tbl[i].ra && raBalance <= tbl[i+1].ra) { lo = tbl[i]; hi = tbl[i+1]; break; }
    }
    baseAge = lo.triggerAge + (raBalance - lo.ra) * ((hi.triggerAge - lo.triggerAge) / (hi.ra - lo.ra));
  }
  // Deferral offset: each year of deferral beyond 65 shifts trigger ~0.8 yrs later
  const deferralOffset = Math.max(0, pAge - 65) * 0.8;
  return Math.min(89, Math.round(baseAge + deferralOffset));
};

// Phase 2 payout drop % relative to Phase 1A, sourced from CPF LIFE Basic Plan estimates.
// Phase 2 payout = Phase 1A × (1 − drop). Larger RA → smaller drop (more self-sustaining).
// Source: CPF Basic Plan payout model documentation (2026 cohort).
export const BASIC_PHASE2_DROP = [
  { ra:  100000, drop: 0.072 },
  { ra:  200000, drop: 0.067 },
  { ra:  300000, drop: 0.058 },
  { ra:  400000, drop: 0.053 },
  { ra:  500000, drop: 0.051 },
  { ra:  700000, drop: 0.042 },
  { ra: 1000000, drop: 0.034 },
];

// Linear interpolation of Phase 2 drop % for any RA balance.
export const interpolatePhase2Drop = (raBalance) => {
  if (raBalance <= 0) return 0.072;
  const tbl = BASIC_PHASE2_DROP;
  if (raBalance <= tbl[0].ra) return tbl[0].drop;
  if (raBalance >= tbl[tbl.length - 1].ra) return tbl[tbl.length - 1].drop;
  let lo = tbl[0], hi = tbl[1];
  for (let i = 0; i < tbl.length - 1; i++) {
    if (raBalance >= tbl[i].ra && raBalance <= tbl[i + 1].ra) { lo = tbl[i]; hi = tbl[i + 1]; break; }
  }
  return lo.drop + (raBalance - lo.ra) * ((hi.drop - lo.drop) / (hi.ra - lo.ra));
};

// Newton-Raphson solver: find the effective monthly rate r such that
// PMT × [1-(1+r)^-n]/r = PV  (i.e. the rate that depletes PV to $0 in n months paying PMT/mo).
// Used to track RA_Retained depletion correctly when Phase 1A PMT comes from lookup table.
export const solveEffectiveRate = (pmt, pv, n) => {
  if (pmt <= 0 || pv <= 0 || n <= 0) return 0.04 / 12;
  let r = 0.06 / 12;
  for (let i = 0; i < 120; i++) {
    const factor = (1 - Math.pow(1 + r, -n)) / r;
    const f = pmt * factor - pv;
    const df = pmt * ((-n * Math.pow(1 + r, -n - 1) * r - (1 - Math.pow(1 + r, -n))) / (r * r));
    if (Math.abs(df) < 1e-15) break;
    r -= f / df;
    if (r <= 0.001 / 12) r = 0.001 / 12;
    if (r > 0.20 / 12) r = 0.20 / 12;
  }
  return r;
};

// Linear interpolation between two known CPF Estimator data points.
// For RA above ERS: extrapolate using the slope of the last two points.
// For RA below minimum: scale proportionally from the first data point.
// pAge (optional, default 65): payout start age. When > 65, applies CPF_LIFE_DEFERRAL_MULT
// so deferred payouts (ages 66–70) match CPF Board Estimator values instead of the
// age-65 extrapolation that systematically understates by $4–$381/mo at deferred ages.
// Values outside [65, 70] clamp to 1.0× (no empirical data beyond estimator coverage).
export const interpolateCpfLife = (raBalance, plan, isMale, pAge = 65) => {
  const tbl = CPF_LIFE_TABLE_M;
  let monthly;
  if (raBalance <= 0) return 0;
  if (raBalance <= tbl[0].ra) {
    // Below minimum — scale proportionally from first point
    monthly = tbl[0][plan] * (raBalance / tbl[0].ra);
  } else if (raBalance >= tbl[tbl.length - 1].ra) {
    // Above ERS — extrapolate using last two points
    const lo = tbl[tbl.length - 2], hi = tbl[tbl.length - 1];
    monthly = hi[plan] + (raBalance - hi.ra) * ((hi[plan] - lo[plan]) / (hi.ra - lo.ra));
  } else {
    // Standard linear interpolation between bracket
    let lo = tbl[0], hi = tbl[1];
    for (let i = 0; i < tbl.length - 1; i++) {
      if (raBalance >= tbl[i].ra && raBalance <= tbl[i + 1].ra) { lo = tbl[i]; hi = tbl[i + 1]; break; }
    }
    monthly = lo[plan] + (raBalance - lo.ra) * ((hi[plan] - lo[plan]) / (hi.ra - lo.ra));
  }
  // Apply actuarial deferral bonus for payout ages 66–80 (indices 0–15 in CPF_LIFE_DEFERRAL_MULT).
  // Ages 65–70: CPF Board Estimator data. Ages 71–80: actuarially derived for RSS migrations.
  const deferralYr = Math.min(15, Math.max(0, (pAge || 65) - 65));
  const deferralMult = (CPF_LIFE_DEFERRAL_MULT[plan] ?? CPF_LIFE_DEFERRAL_MULT.std)[deferralYr];
  return Math.max(0, monthly * deferralMult * (isMale ? 1 : FEMALE_PAYOUT_MULTIPLIER));
};

// Shared Basic Plan parameter setup — used by payoutProjection and sensitivityData.
// Accepts phase1aMonthly from caller so each site can source it differently:
//   payoutProjection  → lifePlans.basic.start  (gender-adjusted lookup, already computed)
//   sensitivityData   → interpolateCpfLife(raVal, 'bas', isMaleSens)  (per-pAge RA)
export const computeBasicPlanParams = (raVal, pAge, phase1aMonthly, premiumPct) => {
  const bPct         = (premiumPct || 10) / 100;
  const premium      = raVal * bPct;
  const pv           = raVal * (1 - bPct);
  const nMonths      = Math.max(12, (90 - pAge) * 12);
  const phase1aAnnual  = phase1aMonthly * 12;
  const dropPct      = interpolatePhase2Drop(raVal);
  const phase2Annual = phase1aAnnual * (1 - dropPct);
  const phase1bTrigger = interpolatePhase1bTrigger(raVal, pAge);
  const effR         = solveEffectiveRate(phase1aMonthly, pv, nMonths);
  const effAnnualFactor = Math.pow(1 + effR, 12);
  return { premium, pv, nMonths, phase1aAnnual, dropPct, phase2Annual, phase1bTrigger, effR, effAnnualFactor };
};

// CQ-1: Shared Basic Plan year-payout helper — eliminates the duplicated Phase 1A/1B/2
// decision tree that previously existed identically in payoutProjection AND sensitivityData.
// Returns {basPay, newRaRem} for one projection year. Caller is responsible for accumulating
// cumPayoutBasicPool (Phase 2 bequest calc) — it is not tracked here to keep the function pure.
//
// Params: age, phase1bTrigger, phase1aAnnual, phase2Annual, basicRaRem, effAnnualFactor
// Returns: { basPay: annual payout this year, newRaRem: updated RA_Retained }
export const computeBasicPlanYearPayout = (age, phase1bTrigger, phase1aAnnual, phase2Annual, basicRaRem, effAnnualFactor) => {
  if (age < 90) {
    let basPay;
    if (age < phase1bTrigger) {
      // Phase 1A: stable lookup-table payout
      basPay = phase1aAnnual;
    } else {
      // Phase 1B: linear decline from Phase 1A → Phase 2 between trigger age and 90
      const yTotal = 90 - phase1bTrigger;
      const yLeft  = 90 - age;
      const t = yTotal > 0 ? yLeft / yTotal : 0;
      basPay = phase2Annual + t * (phase1aAnnual - phase2Annual);
    }
    // RA_Retained: effective annual factor (~4.0–4.5%/yr; close to the SA/RA rate) is
    // calibrated by solveEffectiveRate (Newton-Raphson) to deplete basicPV to $0 at
    // age 90 given the lookup-table Phase 1A PMT. It is NOT higher than 4% — the earlier
    // "8–11%/yr" comment was incorrect and has been removed.
    const newRaRem = Math.max(0, (basicRaRem * effAnnualFactor) - basPay);
    return { basPay, newRaRem };
  } else {
    // Phase 2 (age ≥ 90): lower constant payout from communal annuity pool
    return { basPay: phase2Annual, newRaRem: 0 };
  }
};

// CQ-2: Pure helper that computes one sensitivity-table row for a given payout age.
// Extracted from the sensitivityData useMemo so the per-pAge accumulation loop is no
// longer duplicated alongside the payoutProjection loop — it lives here once.
//
// Params:
//   pAge             — payout age to evaluate (e.g. 65–70)
//   raAtPayout       — RA premium base at pAge: callers pass the full RA when the
//                      applyRaOaTransfer toggle is OFF, or the post-transfer RA when ON
//                      (mirrors lifePlans / payoutProjection's own toggle handling — see
//                      sensitivityData / spouseSensitivityData call sites above).
//   isMale           — gender flag (same as debouncedInputs.isMale)
//   basicPremiumPct  — premium percentage for Basic Plan (usually ~10)
//
// Returns: { pAge, stdMonthly, escMonthly, basMonthly, escVsStd, stdVsBasic, escVsBasic }
// basicPremiumPct param removed — each row derives its own age-appropriate premium per CPF policy.
export const computeSensitivityRow = (pAge, raAtPayout, isMale, maxAge = 95) => {
  const stdStart = interpolateCpfLife(raAtPayout, 'std', isMale, pAge);
  const escStart = interpolateCpfLife(raAtPayout, 'esc', isMale, pAge);

  // Age-appropriate premium: 10% at 65, +2%/yr, capped at 20% (age 70).
  const agePct = Math.min(20, Math.max(10, 10 + (pAge - 65) * 2));
  const basStartScaled = interpolateCpfLife(raAtPayout, 'bas', isMale, pAge) * (1 - agePct / 100) / 0.90;

  const { premium: basicPremS, pv: basicPVS,
          phase1aAnnual: basicP1aAnnual, phase2Annual: basicP2Annual,
          phase1bTrigger: phase1bTriggerS, effAnnualFactor: basicEffAFS
        } = computeBasicPlanParams(raAtPayout, pAge, basStartScaled, agePct);

  let basicRaRem = basicPVS, cumStd = 0, cumEsc = 0, cumBas = 0;
  // B1 fix: separate Phase-2-only pool counter (mirrors cumPayoutBasicPool in payoutProjection).
  // The pre-existing code used cumBas (all Phase 1A+1B+2 payouts) which collapsed Phase 2 bequest to $0 immediately.
  let cumBasPool = 0;
  // B1 fix: effective bequest pool = basicPremS, augmented with any RA_Retained residual carried in at age 90.
  // When Phase 1B fires early, basicRaRem at age 90 may still be > 0 — that balance belongs to the estate.
  let effectivePremPoolS = basicPremS;
  // B2 fix: track the age when Phase 1B actually fires based on real-time balance check (< $60k).
  // Pre-computed phase1bTriggerS is only an approximation; if balance drops below $60k earlier,
  // we use the actual age so the linear ramp in the helper is anchored to the real trigger point.
  let phase1bActualTriggerS = phase1bTriggerS;
  let escVsStd = null, stdVsBasic = null, escVsBasic = null;

  for (let age = pAge; age <= maxAge; age++) {
    const yr = age - pAge;
    const stdPay = stdStart * 12;
    const escPay = (escStart * Math.pow(1.02, yr)) * 12;
    cumStd += stdPay; cumEsc += escPay;

    // B2 fix: if balance drops below $60k before the pre-computed trigger age, lock in actual trigger age now.
    if (age < 90 && basicRaRem < 60000 && age < phase1bActualTriggerS) phase1bActualTriggerS = age;

    const { basPay, newRaRem } = computeBasicPlanYearPayout(
      age, phase1bActualTriggerS, basicP1aAnnual, basicP2Annual, basicRaRem, basicEffAFS
    );
    let basBeq = 0;
    if (age < 90) {
      basicRaRem = newRaRem;
      basBeq = basicRaRem + basicPremS;
    } else {
      // B1 fix: on first Phase 2 year, carry any residual RA_Retained into the effective bequest pool (fires once)
      if (basicRaRem > 0) { effectivePremPoolS += basicRaRem; basicRaRem = 0; }
      cumBasPool += basPay;
      basBeq = Math.max(0, effectivePremPoolS - cumBasPool);
    }
    cumBas += basPay;

    // Bequest pool uses full RA (the CPF LIFE premium — the entire RA entering the scheme).
    const stdBeq = Math.max(0, raAtPayout - cumStd);
    const escBeq = Math.max(0, raAtPayout - cumEsc);
    const stdT = cumStd + stdBeq, escT = cumEsc + escBeq, basT = cumBas + basBeq;
    if (!escVsStd   && age > pAge && escT > stdT)  escVsStd   = age;
    if (!stdVsBasic && age > pAge && stdT > basT)  stdVsBasic = age;
    if (!escVsBasic && age > pAge && escT > basT)  escVsBasic = age;
  }

  return {
    pAge,
    stdMonthly: Math.round(stdStart),
    escMonthly: Math.round(escStart),
    basMonthly: Math.round(interpolateCpfLife(raAtPayout, 'bas', isMale, pAge)), // display raw lookup-table monthly
    escVsStd, stdVsBasic, escVsBasic
  };
};
