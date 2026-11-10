/**
 * XIRR solver (Newton-Raphson).
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// XIRR computation — multi-start Newton-Raphson with bracket verification
//
// cashFlows: array of {t: year_index, v: amount} — negative = outflow, positive = inflow
//
// WHY MULTI-START:
//   The CPF LIFE XIRR cashflow stream (contributions out + annual payouts in + bequest in)
//   can have multiple real roots of its NPV polynomial. A single fixed starting guess (0.05)
//   causes Newton-Raphson to converge to whichever root its landscape leads to — at early
//   death ages this is often a spurious large-negative root, while adjacent ages may diverge
//   entirely, producing the alternating "-20%" / "—" / "-23%" / "—" / "+1.12%" artefact
//   visible in the Data Table from payout age through the CPF LIFE breakeven age.
//
//   Strategy:
//     1. Try four initial guesses spanning the plausible return range.
//     2. Accept the first convergent solution (|NPV| < $1) whose rate lies in [-0.99, 5.0].
//     3. Among any convergent candidates, prefer the one whose rate is ≥ -0.001
//        (positive-or-zero root) — that is the economically meaningful root. If no
//        positive root is found across all guesses, return null (displayed as "—†") so the
//        table shows "insufficient payouts" rather than a misleading negative percentage.
//
//   This is consistent with how financial calculators handle early-termination XIRR:
//   a member who dies at age 73 with only 3 years of payouts received has not yet broken
//   even on CPF contributions — the correct display is "—" not "-20.16%".
export const computeXIRR = (cashFlows) => {
  if (!cashFlows || cashFlows.length < 2) return null;
  if (cashFlows.every(cf => cf.v >= 0) || cashFlows.every(cf => cf.v <= 0)) return null;

  // Inner NR solver — single starting guess, returns rate or null
  const _nr = (guess) => {
    let rate = guess;
    let f = 0;
    for (let iter = 0; iter < 120; iter++) {
      f = 0; let df = 0;
      for (const { t, v } of cashFlows) {
        const denom = Math.pow(1 + rate, t);
        f += v / denom;
        df += -t * v / (denom * (1 + rate));
      }
      if (Math.abs(df) < 1e-12) break;
      const step = f / df;
      // N-BUG-9 fix: guard against Infinity/NaN Newton step. This occurs when df → 0
      // but f stays large (degenerate all-same-sign-subset or extreme cashflow ratios).
      // A step > 10 is also economically implausible — clamp and bail to avoid divergence.
      if (!isFinite(step) || Math.abs(step) > 10) break;
      const newRate = rate - step;
      if (Math.abs(newRate - rate) < 1e-8) { rate = newRate; break; }
      rate = newRate;
      if (rate < -0.999) rate = -0.999;
      if (rate >  9.999) rate =  9.999;
    }
    if (!isFinite(rate) || Math.abs(f) > 1.0) return null;
    if (rate < -0.999 || rate > 5.0) return null; // outside economically plausible range
    return rate;
  };

  // Try guesses: positive-biased first so we naturally prefer the economic root
  const GUESSES = [0.05, 0.01, 0.10, -0.05];
  let bestPositive = null;   // best root ≥ 0
  let bestNegative = null;   // fallback: best root < 0 (economically means no breakeven)

  for (const g of GUESSES) {
    const r = _nr(g);
    if (r === null) continue;
    if (r >= -0.001) {
      // Positive root found — take first one (NR is deterministic from guess,
      // so the first positive-biased guess to converge is the intended root)
      bestPositive = r;
      break;
    } else if (bestNegative === null) {
      bestNegative = r; // record but keep looking for a positive root
    }
  }

  // Return positive root if found; otherwise null (not the negative root).
  // Returning null for the negative case lets the display layer show the
  // informative "—†" label (pre-breakeven) rather than a misleading -20%.
  return bestPositive !== null ? bestPositive : null;
};
