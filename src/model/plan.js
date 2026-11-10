/**
 * Plan model for the new planner. Pure functions: no React, no DOM, no storage.
 *
 * Turns a handful of answers into engine inputs, runs the projection engine and
 * returns the figures the Guided screens show. Every number on screen comes from
 * here, so each is computed once.
 *
 * Conventions
 *  - "Today's dollars": future amounts divided by (1 + inflation) ^ years from now.
 *  - Payouts use the RA on the payout birthday (raAtPayoutStart), which reproduces
 *    CPF Board's published estimates within 2% (see tests/compliance.test.js).
 */
import { runProjectionEngine, interpolateCpfLife, raAtPayoutStart } from '../engine/index.js';
import { DEFAULT_INPUTS } from '../inputs/defaults.js';
import { cohortFRS, projectedSum, scAllocBand, scEmployeeRate, CPF_RATES } from '../policy/cpf2026.js';
import { computeIrasTax } from '../policy/tax.js';

export const OW_CEILING_MONTHLY = 8000;   // CPF Ordinary Wage ceiling from 1 Jan 2026
export const ANNUAL_WAGE_CEILING = 102000; // CPF annual salary ceiling
export const RSTU_RELIEF_CAP = 8000;       // tax relief cap for cash top-ups to your own SA/RA
export const OA_SPREAD_TO_AGE = 90;        // Ordinary Account savings are shown spread to this age

/** The answers the 5-step setup collects. */
export const DEFAULT_ANSWERS = {
  birthYear: 1991, birthMonth: 6, isMale: true,
  status: 'SC',            // 'SC' | 'PR1' | 'PR2' | 'PR3'
  work: 'employee',        // 'employee' | 'self' | 'none'
  salary: 6000,            // monthly, before CPF
  bonusMonths: 1,          // yearly bonus in months of salary
  tradeIncome: 0,          // yearly net trade income (self-employed)
  oa: 50000, sa: 40000, ma: 30000,
  housingMonthly: 0,       // monthly home-loan instalment paid from OA
  housingEndAge: 55,
  targetIncome: 3000,      // monthly, in today's dollars
  payoutAge: 65,
  lifePlan: 'std',         // 'std' | 'esc' | 'bas'
  // What-if levers (0 = off)
  topUpYearly: 0,          // cash top-up to SA / RA
  oaToSaYearly: 0,         // OA → SA transfer (below 55)
  stopWorkAge: 65,
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Age on last birthday, and months until the next one. */
export const ageFrom = (birthYear, birthMonth, now = new Date()) => {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const hadBirthday = m >= birthMonth;
  const age = y - birthYear - (hadBirthday ? 0 : 1);
  const monthsToNext = (((birthMonth - m) % 12) + 12) % 12 || 12;
  return { age: Math.max(0, age), monthsToNext, year: y, month: m };
};

/** Yearly mandatory CPF contributions for an employee (Citizen / PR 3rd year+), split by account. */
export const employeeContributions = (age, monthlySalary, bonusMonths = 0, year = 2026) => {
  const ow = Math.min(num(monthlySalary), OW_CEILING_MONTHLY) * 12;
  const aw = Math.min(num(monthlySalary) * num(bonusMonths), Math.max(0, ANNUAL_WAGE_CEILING - ow));
  const band = scAllocBand(age, year), wages = ow + aw;
  return { oa: Math.round(wages * band.oa), sa: Math.round(wages * band.sa), ma: Math.round(wages * band.ma), wages };
};

/** Answers → full engine inputs. Everything not asked stays on the engine defaults. */
export const toEngineInputs = (answers, now = new Date()) => {
  const a = { ...DEFAULT_ANSWERS, ...answers };
  const { age, year, month } = ageFrom(a.birthYear, a.birthMonth, now);
  const working = a.work !== 'none', self = a.work === 'self';
  const salary = working && !self ? num(a.salary) : 0;
  const c = employeeContributions(age, salary, a.bonusMonths, year);
  const pr = a.status.startsWith('PR');
  return {
    ...DEFAULT_INPUTS,
    currentYear: year, currentMonth: month, currentAge: age,
    birthYear: a.birthYear, birthMonth: a.birthMonth, isMale: !!a.isMale,
    citizenStatus: pr ? 'PR' : 'SC', prYear: pr ? Number(a.status.slice(2)) : 3,
    isSelfEmployed: self, netTradeIncome: self ? num(a.tradeIncome) : 0,
    salaryGross: salary, salaryBonus: Math.round(salary * num(a.bonusMonths)),
    empOaCont: c.oa, empSaCont: c.sa, empMaCont: c.ma,
    // Pay keeps pace with prices, so results in today's dollars are not understated.
    salaryGrowthRate: DEFAULT_INPUTS.inflationRate,
    oaBalance: num(a.oa), saBalance: num(a.sa), maBalance: num(a.ma),
    housingOutflow: Math.round(num(a.housingMonthly) * 12), housingStopAge: clamp(num(a.housingEndAge, 55), age, 95),
    targetMonthlyIncome: num(a.targetIncome), payoutAge: clamp(num(a.payoutAge, 65), 65, 70),
    contributionStopAge: clamp(num(a.stopWorkAge, 65), age, 95),
    vcSaTopup: num(a.topUpYearly), oaToSaTransfer: age < 55 ? num(a.oaToSaYearly) : 0,
    propertyValue: 0, includeProperty: false,
  };
};

/** RA after `years` of base interest plus extra interest, with nothing else in CPF. */
export const growRa = (amount, years) => {
  let ra = amount;
  for (let i = 0; i < Math.round(years); i++) {
    ra += ra * CPF_RATES.RA + Math.min(ra, 30000) * 0.02 + Math.min(Math.max(0, ra - 30000), 30000) * 0.01;
  }
  return ra;
};

const LABELS = [[85, 'On track'], [65, 'Nearly there'], [40, 'Needs attention'], [0, 'Off track']];

/**
 * Runs the engine and derives everything the Guided screens need.
 * @returns plan object (see fields below). Money fields ending in `Today` are in today's dollars.
 */
export const buildPlan = (answers, now = new Date()) => {
  const a = { ...DEFAULT_ANSWERS, ...answers };
  const inputs = toEngineInputs(a, now);
  const rows = runProjectionEngine(inputs);
  const byAge = new Map(rows.map((r) => [r.age, r]));
  const { age, monthsToNext, year } = ageFrom(a.birthYear, a.birthMonth, now);
  const pa = inputs.payoutAge, infl = num(inputs.inflationRate, 2) / 100, g = num(inputs.retirementSumGrowth, 3) / 100;

  // Years from today to the birthday that starts age `x`
  const yearsTo = (x) => Math.max(0, x - age - 1 + monthsToNext / 12);
  const toToday = (amount, atAge) => amount / Math.pow(1 + infl, yearsTo(atAge));

  // ── Payout ──────────────────────────────────────────────────────────────
  const payRow = byAge.get(Math.max(pa, age));
  const raAtPayout = raAtPayoutStart(payRow);
  const payoutAt = (plan) => Math.round(interpolateCpfLife(raAtPayout, plan, inputs.isMale, Math.max(pa, age)));
  const payouts = { std: payoutAt('std'), esc: payoutAt('esc'), bas: payoutAt('bas') };
  const payout = payouts[a.lifePlan] ?? payouts.std;
  const payoutToday = Math.round(toToday(payout, Math.max(pa, age)));
  // Ordinary Account savings at payout age, spread evenly to age 90 (they keep earning 2.5%).
  // CPF LIFE is for life; this part is not, so the screens always show the two separately.
  const oaAtPayoutToday = Math.round(toToday(byAge.get(Math.max(pa, age) - 1)?.oa ?? num(a.oa), Math.max(pa, age)));
  const months = Math.max(12, (OA_SPREAD_TO_AGE - Math.max(pa, age)) * 12);
  const realMonthly = Math.pow((1 + CPF_RATES.OA) / (1 + infl), 1 / 12) - 1;
  const oaMonthlyToday = Math.round(Math.abs(realMonthly) < 1e-9 ? oaAtPayoutToday / months
    : (oaAtPayoutToday * realMonthly) / (1 - Math.pow(1 + realMonthly, -months)));
  const incomeToday = payoutToday + oaMonthlyToday;
  const target = num(a.targetIncome);
  const coverage = target > 0 ? incomeToday / target : null;
  const gapToday = target > 0 ? Math.max(0, target - incomeToday) : 0;

  // ── At 55: how much of the Full Retirement Sum is set aside ──────────────
  const year55 = a.birthYear + 55;
  const frs55 = cohortFRS(year55, g);
  let raAt55;
  if (age >= 55) {
    raAt55 = num(a.sa); // from 55 the "SA" field holds the Retirement Account balance
  } else {
    const before = byAge.get(54) || { sa: num(a.sa), oa: num(a.oa) };
    raAt55 = Math.min(frs55, before.sa + Math.max(0, before.oa - 5000));
  }
  const frsCoverage = frs55 > 0 ? Math.min(1, raAt55 / frs55) : 0;

  // ── MediSave against the Basic Healthcare Sum at 65 ─────────────────────
  const row65 = byAge.get(Math.max(65, age));
  const bhs65 = projectedSum('BHS', g, Math.max(0, a.birthYear + 65 - 2026)); // fixed in the year you turn 65
  const maCoverage = row65 && bhs65 > 0 ? Math.min(1, row65.ma / bhs65) : 0;

  // ── Readiness: one score, three plain parts ─────────────────────────────
  const parts = [
    { key: 'income', label: 'Income against your target', weight: 0.5, value: coverage === null ? frsCoverage : Math.min(1, coverage) },
    { key: 'frs', label: 'Retirement savings at 55 against the Full Retirement Sum', weight: 0.3, value: frsCoverage },
    { key: 'health', label: 'MediSave at 65 against the Basic Healthcare Sum', weight: 0.2, value: maCoverage },
  ];
  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0) * 100);
  const label = LABELS.find(([min]) => score >= min)[1];

  // ── Watch-outs (most serious first) ─────────────────────────────────────
  const watch = [];
  if (inputs.housingOutflow > 0) {
    const short = rows.find((r) => r.age < inputs.housingStopAge && r.oa <= 0);
    if (short) watch.push({ key: 'oa-housing', age: short.age, text: `Your Ordinary Account runs out at ${short.age}, before your home loan ends at ${inputs.housingStopAge}. You would need to pay the rest in cash.` });
  }
  if (age < 55 && frsCoverage < 0.5) watch.push({ key: 'below-brs', age: 55, text: 'At 55 you are projected to have less than the Basic Retirement Sum. CPF LIFE payouts will be lower than most people expect.' });
  const maOut = rows.find((r) => r.age > Math.max(65, age) && r.age < 80 && r.ma <= 0); // later than 80 depends too much on cost assumptions to warn about
  if (maOut) watch.push({ key: 'ma-out', age: maOut.age, text: `MediSave is projected to run out at ${maOut.age} on current premium and medical-cost assumptions.` });

  // ── Chart series, in today's dollars ────────────────────────────────────
  // Up to the payout birthday only: after that the Retirement Account has become CPF LIFE income.
  const series = rows.filter((r) => r.age < Math.max(pa, age + 1)).map((r) => {
    const d = Math.pow(1 + infl, yearsTo(r.age + 1));
    return { age: r.age, oa: r.oa / d, retire: (r.sa + r.ra) / d, ma: r.ma / d, total: r.total / d };
  });

  return {
    answers: a, inputs, rows, age, year, payoutAge: pa, year55, yearPayout: a.birthYear + pa,
    raAtPayout, payouts, payout, payoutToday, oaAtPayoutToday, oaMonthlyToday, incomeToday, target, coverage, gapToday,
    frs55, raAt55, frsCoverage, maCoverage, bhs65,
    totalNow: num(a.oa) + num(a.sa) + num(a.ma),
    score, label, parts, watch, series,
    assumptions: { inflation: infl, sumGrowth: g, salaryGrowth: num(inputs.salaryGrowthRate) / 100, oa: CPF_RATES.OA, sma: CPF_RATES.SA },
  };
};

/** Rough yearly income tax saved by a cash top-up of `amount` (employee CPF relief and earned-income relief only). */
export const taxSavedByTopUp = (plan, amount) => {
  const i = plan.inputs;
  const income = i.isSelfEmployed ? num(i.netTradeIncome) : num(i.salaryGross) * 12 + num(i.salaryBonus);
  const wages = Math.min(num(i.salaryGross), OW_CEILING_MONTHLY) * 12 + Math.min(num(i.salaryBonus), Math.max(0, ANNUAL_WAGE_CEILING - Math.min(num(i.salaryGross), OW_CEILING_MONTHLY) * 12));
  const employeeRate = scEmployeeRate(plan.age, plan.year);
  const chargeable = Math.max(0, income - (i.isSelfEmployed ? 0 : wages * employeeRate) - 1000);
  const relief = Math.min(amount, RSTU_RELIEF_CAP);
  return Math.max(0, computeIrasTax(chargeable) - computeIrasTax(Math.max(0, chargeable - relief)));
};

/**
 * Candidate moves, each measured by re-running the engine with one change.
 * Returns up to `limit` moves that raise the monthly payout, biggest gain first.
 */
export const findMoves = (answers, now = new Date(), limit = 3) => {
  const base = buildPlan(answers, now);
  const a = base.answers, out = [];
  const tryMove = (key, change, describe) => {
    const p = buildPlan({ ...a, ...change }, now);
    const gain = p.incomeToday - base.incomeToday, lifeGain = p.payoutToday - base.payoutToday;
    if (gain >= 10) out.push({ key, change, gain, lifeGain, scoreGain: p.score - base.score, ...describe(p) });
  };

  // 1. Cash top-up: about 5% of pay, between $100 and $8,000 / 12 a month
  const income = a.work === 'self' ? num(a.tradeIncome) : num(a.salary) * 12;
  if (a.work !== 'none' && num(a.topUpYearly) === 0) {
    const yearly = clamp(Math.round((income * 0.05) / 600) * 600, 1200, RSTU_RELIEF_CAP);
    tryMove('topup', { topUpYearly: yearly }, () => ({
      title: `Top up your ${base.age < 55 ? 'Special' : 'Retirement'} Account by S$${Math.round(yearly / 12)} a month`,
      cost: `S$${yearly.toLocaleString()} a year in cash`,
      bonus: taxSavedByTopUp(base, yearly) > 0 ? `Saves about S$${taxSavedByTopUp(base, yearly).toLocaleString()} a year in income tax` : null,
      catch: 'Top-ups cannot be withdrawn. They come back as monthly payouts.',
    }));
  }
  // 2. Start payouts later
  if (base.payoutAge < 70 && base.age < base.payoutAge) {
    const later = Math.min(70, base.payoutAge + 2);
    tryMove('defer', { payoutAge: later }, () => ({
      title: `Start payouts at ${later} instead of ${base.payoutAge}`,
      cost: `No cash cost, but no CPF payout for ${later - base.payoutAge} more years`,
      bonus: null,
      catch: 'You need other income until then. The total you receive is lower if you die early.',
    }));
  }
  // 3. Move OA savings to the Special Account (below 55, with room and spare OA)
  if (base.age < 55 && num(a.oaToSaYearly) === 0 && num(a.oa) > 20000 + num(a.housingMonthly) * 24) {
    const yearly = clamp(Math.round(((num(a.oa) - 20000) * 0.25) / 500) * 500, 1000, 10000);
    tryMove('oa-to-sa', { oaToSaYearly: yearly }, () => ({
      title: `Move S$${yearly.toLocaleString()} a year from your Ordinary Account into retirement savings`,
      cost: 'No cash cost',
      bonus: 'Earns 4% instead of 2.5% (Special Account now, Retirement Account from 55)',
      catch: 'Cannot be reversed. That money can no longer pay for housing or education.',
    }));
  }
  // 4. Pay part of the home loan in cash
  if (num(a.housingMonthly) >= 400 && base.frsCoverage < 1) {
    const less = Math.round((num(a.housingMonthly) * 0.25) / 50) * 50;
    tryMove('housing', { housingMonthly: num(a.housingMonthly) - less }, () => ({
      title: `Pay S$${less} a month of your home loan in cash instead of from CPF`,
      cost: `S$${(less * 12).toLocaleString()} a year in cash`,
      bonus: 'Also cuts the CPF you must refund when you sell',
      catch: 'Less cash in hand each month.',
    }));
  }
  // 5. Work two more years
  if (a.work !== 'none' && num(a.stopWorkAge) < 70) {
    const later = num(a.stopWorkAge) + 2;
    tryMove('work-longer', { stopWorkAge: later }, () => ({
      title: `Work until ${later}`,
      cost: 'Two more years of work',
      bonus: null,
      catch: 'Contribution rates are lower from 55, and lower again from 60 and 65.',
    }));
  }
  return { base, moves: out.sort((x, y) => y.gain - x.gain).slice(0, limit) };
};
