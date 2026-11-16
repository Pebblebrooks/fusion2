/**
 * Workspace models built on the plan model: household (partner), top-up comparison and Monte Carlo.
 * Pure functions, no React. Every figure comes from re-running the engine through buildPlan.
 */
import { buildPlan, chargeableIncome, taxSavedByRelief, DEFAULT_ANSWERS, RSTU_RELIEF_CAP } from './plan.js';
import { SRS_CAP_SC_PR } from '../policy/cpf2026.js';
import { getMarginalRate } from '../policy/tax.js';
import { seededRandom } from '../engine/common.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The partner's answers, in the same shape as the main person's. Shared assumptions are copied across. */
export const partnerAnswers = (a) => ({
  ...DEFAULT_ANSWERS,
  birthYear: a.pBirthYear, birthMonth: a.pBirthMonth, isMale: a.pIsMale, status: a.pStatus,
  work: a.pWork, salary: a.pSalary, bonusMonths: a.pBonusMonths, tradeIncome: a.pTradeIncome,
  oa: a.pOa, sa: a.pSa, ma: a.pMa, housingMonthly: 0, targetIncome: 0,
  payoutAge: a.pPayoutAge, stopWorkAge: a.pStopWorkAge, topUpYearly: a.pTopUpYearly, lifePlan: a.lifePlan,
  inflation: a.inflation, realPayGrowth: a.realPayGrowth, sumGrowth: a.sumGrowth,
});

/**
 * Household view. With a partner, the income target is treated as the household's.
 * `alone` shows what each person would have without the other's CPF LIFE, which stops at death.
 */
export const buildHousehold = (answers, now = new Date()) => {
  const a = { ...DEFAULT_ANSWERS, ...answers };
  const you = buildPlan(a, now);
  const partner = a.hasPartner ? buildPlan(partnerAnswers(a), now) : null;
  const incomeToday = you.incomeToday + (partner ? partner.incomeToday : 0);
  const lifeToday = you.payoutToday + (partner ? partner.payoutToday : 0);
  const target = num(a.targetIncome);
  return {
    you, partner, incomeToday, lifeToday, target,
    coverage: target > 0 ? incomeToday / target : null,
    gapToday: target > 0 ? Math.max(0, target - incomeToday) : 0,
    // Year in which both sets of payouts have started
    yearBoth: partner ? Math.max(you.yearPayout, partner.yearPayout) : you.yearPayout,
    alone: partner ? { you: you.incomeToday, partner: partner.incomeToday } : null,
  };
};

/**
 * Three ways to put `budget` dollars a year towards retirement and cut tax, each on its own.
 * Tax figures use pay less employee CPF and earned-income relief only, so they are estimates.
 */
export const compareTopUps = (answers, now = new Date(), budget = 8000) => {
  const a = { ...DEFAULT_ANSWERS, ...answers };
  const base = buildPlan(a, now), b = Math.max(0, num(budget));
  const yearsToStop = Math.max(0, num(a.stopWorkAge) - base.age);
  const options = [];

  const own = Math.min(b, RSTU_RELIEF_CAP * 2); // relief on the first S$8,000; more can still be topped up
  const ownPlan = buildPlan({ ...a, topUpYearly: num(a.topUpYearly) + own }, now);
  options.push({ key: 'own', amount: own, relief: Math.min(own, RSTU_RELIEF_CAP), taxSaved: taxSavedByRelief(base, Math.min(own, RSTU_RELIEF_CAP)),
    gainToday: ownPlan.incomeToday - base.incomeToday, forLife: true, account: base.age < 55 ? 'Special Account' : 'Retirement Account' });

  if (a.hasPartner) {
    const pa = partnerAnswers(a), pBase = buildPlan(pa, now);
    const amt = Math.min(b, RSTU_RELIEF_CAP * 2);
    const pPlan = buildPlan({ ...pa, topUpYearly: num(pa.topUpYearly) + amt }, now);
    options.push({ key: 'partner', amount: amt, relief: Math.min(amt, RSTU_RELIEF_CAP), taxSaved: taxSavedByRelief(base, Math.min(amt, RSTU_RELIEF_CAP)),
      gainToday: pPlan.incomeToday - pBase.incomeToday, forLife: true, account: pBase.age < 55 ? 'Special Account' : 'Retirement Account' });
  }

  const srs = Math.min(b, SRS_CAP_SC_PR), r = num(a.srsReturn, 3) / 100, yrs = Math.max(0, Math.min(yearsToStop, 63 - base.age));
  const srsValue = Math.round(r === 0 ? srs * yrs : srs * ((Math.pow(1 + r, yrs) - 1) / r) * (1 + r));
  options.push({ key: 'srs', amount: srs, relief: srs, taxSaved: taxSavedByRelief(base, srs), years: yrs,
    valueAt63Today: Math.round(srsValue / Math.pow(1 + base.assumptions.inflation, Math.max(0, 63 - base.age))), forLife: false });

  return { base, budget: b, chargeable: Math.round(chargeableIncome(base)), marginalRate: getMarginalRate(chargeableIncome(base)), options,
    maxRelief: RSTU_RELIEF_CAP + (a.hasPartner ? RSTU_RELIEF_CAP : 0) + SRS_CAP_SC_PR };
};

/**
 * Monte Carlo: the plan re-run `runs` times with CPF interest moved up or down each year within
 * ±`band` percentage points. Seeded, so the same plan always gives the same range.
 * CPF rates have legal floors, so the low end here is deliberately cautious.
 */
export const runConfidence = (answers, now = new Date(), { runs = 500, band = 1 } = {}) => {
  const a = { ...DEFAULT_ANSWERS, ...answers };
  const base = buildPlan(a, now);
  const seed = (a.birthYear * 7919 + base.payoutAge * 97 + Math.round(num(a.oa) + num(a.sa))) | 0;
  const incomes = [], lifes = [];
  let frsHits = 0, targetHits = 0;
  for (let i = 0; i < runs; i++) {
    const p = buildPlan(a, now, { randomiseRates: true, mcVariance: band, rng: seededRandom(seed ^ (i * 2654435761)) });
    // Cash from a home sale is not part of the CPF simulation; carry the base figure across.
    const income = p.payoutToday + p.oaMonthlyToday + base.otherMonthlyToday;
    incomes.push(income); lifes.push(p.payoutToday);
    if (p.frsCoverage >= 0.999) frsHits++;
    if (base.target > 0 && income >= base.target) targetHits++;
  }
  incomes.sort((x, y) => x - y); lifes.sort((x, y) => x - y);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
  // Histogram of monthly income for the chart
  const lo = incomes[0], hi = incomes[incomes.length - 1], bins = 20, step = Math.max(1, (hi - lo) / bins);
  const hist = Array.from({ length: bins }, (_, k) => ({ from: lo + k * step, to: lo + (k + 1) * step, count: 0 }));
  for (const v of incomes) hist[Math.min(bins - 1, Math.floor((v - lo) / step))].count++;
  return {
    base, runs, band, hist,
    income: { p10: q(incomes, 0.1), p50: q(incomes, 0.5), p90: q(incomes, 0.9), min: lo, max: hi },
    life: { p10: q(lifes, 0.1), p50: q(lifes, 0.5), p90: q(lifes, 0.9) },
    chanceTarget: base.target > 0 ? targetHits / runs : null,
    chanceFrs: base.age < 55 ? frsHits / runs : null,
  };
};

/* ── Healthcare ───────────────────────────────────────────────────────────── */
/**
 * What healthcare costs do to MediSave. Money figures are in today's dollars.
 *   points   — premiums and bills at a few ages (from MediSave, and cash on top)
 *   runsOut  — first age at which MediSave cannot cover the year's costs (null if it always can)
 *   cashToday — total cash needed to age 90 for costs MediSave will not or cannot pay
 */
export const healthcare = (plan) => {
  const infl = plan.assumptions.inflation, age = plan.age;
  const today = (v, atAge) => Math.round(v / Math.pow(1 + infl, Math.max(0, atAge - age)));
  const rows = plan.rows.filter((r) => r.age <= 90);
  const points = [age, 55, 65, 75, 85].filter((a, i, arr) => a >= age && arr.indexOf(a) === i).map((a) => {
    const r = rows.find((x) => x.age === a);
    return r ? { age: a, msl: today(r.mslPremium, a), fromMa: today(r.yearMedOut, a), cash: today(r.medCash, a), ma: today(r.ma, a) } : null;
  }).filter(Boolean);
  const dry = rows.find((r) => r.age > age && r.ma <= 0 && r.medCash > 0);
  const firstCash = rows.find((r) => r.medCash > 0);
  return {
    points, runsOut: dry ? dry.age : null, cashFrom: firstCash ? firstCash.age : null,
    cashToday: rows.reduce((s, r) => s + today(r.medCash, r.age), 0),
    maAt65Today: age < 65 ? today(rows.find((r) => r.age === 64)?.ma ?? 0, 65) : null, bhs65Today: age < 65 ? today(plan.bhs65, 65) : null, maCoverage: plan.maCoverage,
  };
};

/* ── Drawdown ─────────────────────────────────────────────────────────────── */
/**
 * Spending the Ordinary Account after payouts start, and what is left for family.
 * Today's dollars. The CPF LIFE part is the unused premium (premium less payouts received,
 * no interest), which CPF pays to beneficiaries; it is not estimated for the Basic plan.
 */
export const drawdown = (plan) => {
  const infl = plan.assumptions.inflation, from = Math.max(plan.payoutAge, plan.age), a = plan.answers;
  const realYear = (1 + 0.025) / (1 + infl) - 1;
  const yearly = plan.oaMonthlyToday * 12;
  let oa = plan.oaAtPayoutToday;
  const left = [];
  const esc = a.lifePlan === 'esc', basic = a.lifePlan === 'bas';
  let paidNominal = 0, payoutNominal = plan.payout * 12;
  for (let ageNow = from; ageNow <= 95; ageNow++) {
    if ([75, 80, 85, 90, 95].includes(ageNow) && ageNow > from) {
      const premiumLeft = basic ? null : Math.max(0, plan.raAtPayout - paidNominal);
      left.push({ age: ageNow, oa: Math.max(0, Math.round(oa)),
        life: premiumLeft === null ? null : Math.round(premiumLeft / Math.pow(1 + infl, ageNow - plan.age)) });
    }
    if (ageNow < plan.spreadTo) oa = Math.max(plan.oaKeepToday, (oa - yearly)) * (1 + realYear);
    else oa *= (1 + realYear);
    paidNominal += payoutNominal; if (esc) payoutNominal *= 1.02;
  }
  // At 55: the first $5,000, or everything above the Full Retirement Sum if that is more.
  const before = plan.rows.find((r) => r.age === 54);
  const total55 = before ? before.oa + before.sa : null;
  const maxAt55 = total55 === null ? null : Math.max(Math.min(5000, total55), total55 - plan.frs55);
  return {
    from, spreadTo: plan.spreadTo, keep: plan.oaKeepToday, monthly: plan.oaMonthlyToday, startToday: plan.oaAtPayoutToday, left,
    maxAt55Today: maxAt55 === null ? null : Math.round(maxAt55 / Math.pow(1 + infl, 55 - plan.age)), basic,
  };
};

/* ── Solvers ──────────────────────────────────────────────────────────────── */
const incomeFor = (a, now) => (a.hasPartner ? buildHousehold(a, now).incomeToday : buildPlan(a, now).incomeToday);

/** Earliest age to stop work and still meet the income target. Searches every age; income rises with each extra year. */
export const solveStopWork = (answers, now = new Date()) => {
  const a = { ...DEFAULT_ANSWERS, ...answers }, base = buildPlan(a, now), target = num(a.targetIncome);
  if (target <= 0 || a.work === 'none') return { possible: false, reason: target <= 0 ? 'no-target' : 'not-working' };
  const lo = Math.max(base.age, 40), hi = 75;
  let found = null;
  for (let s = lo; s <= hi; s++) {
    const income = incomeFor({ ...a, stopWorkAge: s }, now);
    if (income >= target) { found = { age: s, incomeToday: income }; break; }
  }
  return found ? { possible: true, ...found, current: num(a.stopWorkAge), target }
    : { possible: false, reason: 'out-of-reach', best: incomeFor({ ...a, stopWorkAge: hi }, now), target, at: hi };
};

/** Smallest yearly cash top-up (in S$500 steps) that meets the income target. */
export const solveTopUp = (answers, now = new Date()) => {
  const a = { ...DEFAULT_ANSWERS, ...answers }, target = num(a.targetIncome), STEP = 500, MAX = 40000;
  if (target <= 0) return { possible: false, reason: 'no-target' };
  const at = (amt) => incomeFor({ ...a, topUpYearly: amt }, now);
  if (at(0) >= target) return { possible: true, amount: 0, incomeToday: at(0), target };
  const top = at(MAX);
  if (top < target) return { possible: false, reason: 'out-of-reach', best: top, target, at: MAX };
  let lo = 0, hi = MAX / STEP; // income does not fall as the top-up rises
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid * STEP) >= target) hi = mid; else lo = mid; }
  const amount = hi * STEP, plan = buildPlan({ ...a, topUpYearly: amount }, now);
  return { possible: true, amount, incomeToday: at(amount), target, taxSaved: taxSavedByRelief(buildPlan(a, now), Math.min(amount, RSTU_RELIEF_CAP)),
    turnedAway: plan.rows.some((r) => r.topUpNotAccepted > 0) };
};
