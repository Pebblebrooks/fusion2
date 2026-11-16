// Plan model for the new planner: the figures on the Guided screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, findMoves, toEngineInputs, ageFrom, employeeContributions, taxSavedByTopUp, DEFAULT_ANSWERS } from '../src/model/plan.js';
import { encodePlanState, decodePlanState } from '../src/state/shareLink.js';

const NOW = new Date(2026, 10, 11); // 11 Nov 2026

test('age comes from birth month and year', () => {
  assert.deepEqual(ageFrom(1991, 6, NOW), { age: 35, monthsToNext: 7, year: 2026, month: 11 });
  assert.equal(ageFrom(1991, 12, NOW).age, 34);
  assert.equal(ageFrom(1991, 11, NOW).monthsToNext, 12);
});

test('employee contributions follow the 2026 allocation and wage ceilings', () => {
  const c = employeeContributions(35, 6000, 1, 2026); // 37% of 78,000
  assert.equal(c.oa + c.sa + c.ma, Math.round(78000 * 0.37));
  const capped = employeeContributions(35, 20000, 6, 2026); // OW 96,000 + AW capped at 6,000
  assert.equal(capped.wages, 102000);
});

test('the default plan adds up', () => {
  const p = buildPlan({}, NOW);
  assert.equal(p.age, 35);
  assert.equal(p.incomeToday, p.payoutToday + p.oaMonthlyToday);
  assert.equal(p.gapToday, Math.max(0, p.target - p.incomeToday));
  assert.ok(p.payoutToday < p.payout, 'today\'s dollars are below future dollars');
  assert.ok(p.score >= 0 && p.score <= 100);
  assert.equal(Math.round(p.parts.reduce((s, x) => s + x.weight, 0) * 100), 100);
  assert.ok(p.series.at(-1).age < p.payoutAge, 'chart stops at the payout birthday');
});

test('CPF LIFE alone never counts Ordinary Account savings', () => {
  const p = buildPlan({ oa: 500000 }, NOW), q = buildPlan({ oa: 0 }, NOW);
  assert.ok(p.oaMonthlyToday > q.oaMonthlyToday);
  assert.ok(Math.abs(p.payoutToday - q.payoutToday) / q.payoutToday < 0.35, 'payout depends on the Retirement Account, capped by the Full Retirement Sum');
});

test('moves are measured one at a time and each raises income', () => {
  const { base, moves } = findMoves({ housingMonthly: 1200 }, NOW);
  assert.ok(moves.length > 0 && moves.length <= 3);
  for (const m of moves) {
    const p = buildPlan({ ...base.answers, ...m.change }, NOW);
    assert.equal(Math.round(p.incomeToday - base.incomeToday), Math.round(m.gain), m.key);
    assert.ok(m.gain >= 10 && m.title && m.cost && m.catch);
  }
  assert.deepEqual(moves.map((m) => m.gain), [...moves.map((m) => m.gain)].sort((a, b) => b - a));
});

test('no top-up or deferral is suggested where it cannot apply', () => {
  const retired = findMoves({ birthYear: 1955, work: 'none', salary: 0, sa: 200000 }, NOW).moves.map((m) => m.key);
  assert.ok(!retired.includes('defer') && !retired.includes('topup') && !retired.includes('work-longer'));
});

test('tax saved by a top-up uses relief of at most S$8,000', () => {
  const p = buildPlan({ salary: 10000 }, NOW);
  assert.equal(taxSavedByTopUp(p, 8000), taxSavedByTopUp(p, 16000));
  assert.ok(taxSavedByTopUp(p, 8000) > 0);
  assert.equal(taxSavedByTopUp(buildPlan({ work: 'none', salary: 0 }, NOW), 8000), 0);
});

test('a plan survives the hand-off link to the classic planner', () => {
  const inputs = toEngineInputs({ ...DEFAULT_ANSWERS, housingMonthly: 900, targetIncome: 4200 }, NOW);
  const back = JSON.parse(decodePlanState(encodePlanState(JSON.stringify({ appVersion: 'V4-2026', inputs })))).inputs;
  assert.equal(back.housingOutflow, 10800);
  assert.equal(back.targetMonthlyIncome, 4200);
  assert.equal(back.birthYear, 1991);
});

test('edge profiles do not break: 16, 54, 55, 64, 70, 90, zero balances', () => {
  for (const birthYear of [2010, 1972, 1971, 1962, 1956, 1936]) {
    const p = buildPlan({ birthYear, oa: 0, sa: 0, ma: 0 }, NOW);
    for (const k of ['payoutToday', 'incomeToday', 'score', 'frsCoverage', 'maCoverage']) assert.ok(Number.isFinite(p[k]) && p[k] >= 0, `${birthYear} ${k}=${p[k]}`);
  }
});

// ── Workspace and Adviser ──────────────────────────────────────────────────
import { stressTests, yearRows, toCsv, summarise } from '../src/model/plan.js';
import { tierForGateCode, tierForUpgradeCode, tierForAnyCode, GATE_PASSWORDS, TIER_PASSWORDS } from '../src/entitlements/gate.js';

test('stress tests change one assumption each and never raise income by making things worse', () => {
  const { base, cases } = stressTests({}, NOW);
  assert.ok(cases.length >= 4);
  for (const c of cases.filter((x) => x.key !== 'sums')) assert.ok(c.delta <= 0, `${c.key} ${c.delta}`);
  assert.equal(cases.find((c) => c.key === 'pay').incomeToday - base.incomeToday, cases.find((c) => c.key === 'pay').delta);
  assert.ok(!stressTests({ work: 'none', salary: 0 }, NOW).cases.some((c) => c.key === 'stop' || c.key === 'bonus'));
});

test('assumptions feed the engine and standard settings leave results unchanged', () => {
  assert.deepEqual(summarise(buildPlan({ inflation: 2, realPayGrowth: 0, sumGrowth: 3 }, NOW)), summarise(buildPlan({}, NOW)));
  assert.ok(buildPlan({ realPayGrowth: 2 }, NOW).incomeToday > buildPlan({}, NOW).incomeToday);
  assert.equal(toEngineInputs({ inflation: 3, realPayGrowth: 1 }, NOW).salaryGrowthRate, 4);
});

test('year table and CSV line up', () => {
  const rows = yearRows(buildPlan({}, NOW));
  assert.equal(rows[0].age, 35);
  assert.equal(rows[0].year, 2027);
  const csv = toCsv(rows).split('\n');
  assert.equal(csv.length, rows.length + 1);
  assert.equal(csv[1].split(',').length, 6);
});

test('access and upgrade codes map to the right plans', () => {
  assert.equal(tierForGateCode(GATE_PASSWORDS.beta), 'lite');
  assert.equal(tierForGateCode(GATE_PASSWORDS.admin), 'pro');
  assert.equal(tierForUpgradeCode(TIER_PASSWORDS.plus), 'plus');
  assert.equal(tierForUpgradeCode(TIER_PASSWORDS.pro), 'pro');
  assert.equal(tierForUpgradeCode('nope'), null);
  assert.equal(tierForUpgradeCode(GATE_PASSWORDS.beta), null);
  assert.deepEqual([GATE_PASSWORDS.beta, TIER_PASSWORDS.plus, TIER_PASSWORDS.pro, GATE_PASSWORDS.admin, 'nope', ''].map(tierForAnyCode), ['lite', 'plus', 'pro', 'pro', null, null]);
});

// ── Workspace modules (v3) ─────────────────────────────────────────────────
import { buildHousehold, compareTopUps, runConfidence, partnerAnswers } from '../src/model/household.js';

const COUPLE = { hasPartner: true, pBirthYear: 1993, pSalary: 4500, pOa: 30000, pSa: 20000, pMa: 15000, targetIncome: 5500 };

test('household: joint income is the sum of two separate plans, and the target is shared', () => {
  const h = buildHousehold(COUPLE, NOW);
  assert.equal(h.incomeToday, h.you.incomeToday + h.partner.incomeToday);
  assert.equal(h.lifeToday, h.you.payoutToday + h.partner.payoutToday);
  assert.equal(h.gapToday, Math.max(0, 5500 - h.incomeToday));
  assert.equal(h.partner.age, 33);
  assert.equal(partnerAnswers({ ...DEFAULT_ANSWERS, ...COUPLE }).housingMonthly, 0);
  const solo = buildHousehold({}, NOW);
  assert.equal(solo.partner, null); assert.equal(solo.incomeToday, solo.you.incomeToday);
  // The main person's own plan does not change when a partner is added.
  assert.equal(h.you.incomeToday, buildPlan({ targetIncome: 5500 }, NOW).incomeToday);
});

test('property: owning a home changes nothing until it is sold', () => {
  const own = { ownsHome: true, homeValue: 600000, cpfUsedForHome: 150000, housingMonthly: 1200 };
  assert.deepEqual(summarise(buildPlan(own, NOW)), summarise(buildPlan({ housingMonthly: 1200 }, NOW)));
  assert.equal(buildPlan(own, NOW).sale, null);
});

test('property: the sale adds up, and the CPF refund can pay for the next home', () => {
  const p = buildPlan({ ownsHome: true, homeValue: 600000, cpfUsedForHome: 150000, housingMonthly: 1200, sellHomeAge: 60, nextHomeCost: 300000 }, NOW);
  const s = p.sale;
  assert.equal(s.resources, s.price - s.loanOwed - s.nextCost);
  assert.equal(s.inCpf + s.cash, Math.max(0, s.resources));
  assert.ok(s.refund > 150000 && s.refund <= s.price, `refund ${s.refund}`);
  assert.equal(s.shortfall, false);
  assert.equal(p.incomeToday, p.payoutToday + p.oaMonthlyToday + p.otherMonthlyToday);
  const keep = buildPlan({ ownsHome: true, homeValue: 600000, cpfUsedForHome: 150000, housingMonthly: 1200 }, NOW);
  assert.ok(p.incomeToday > keep.incomeToday, 'releasing home equity raises retirement income');
  const tooDear = buildPlan({ ownsHome: true, homeValue: 300000, sellHomeAge: 60, nextHomeCost: 500000 }, NOW);
  assert.equal(tooDear.sale.shortfall, true);
  assert.equal(tooDear.watch[0].key, 'sale-short');
});

test('property: Silver Housing Bonus needs a citizen aged 55 or more and never exceeds S$40,000', () => {
  const old = { birthYear: 1964, sa: 120000, oa: 20000, ma: 60000, salary: 3000, ownsHome: true, homeValue: 550000, cpfUsedForHome: 180000, sellHomeAge: 64, nextHomeCost: 300000, shb: true };
  const s = buildPlan(old, NOW).sale;
  assert.equal(s.shb, true);
  assert.ok(s.committed > 0 && s.committed <= 60000);
  assert.equal(s.bonus, Math.floor(s.committed / 2));
  assert.equal(buildPlan({ ...old, shbNextFlat: '2r' }, NOW).sale.bonus, s.bonus + 10000);
  assert.equal(buildPlan({ ...old, status: 'PR3' }, NOW).sale.shb, false);
  assert.equal(buildPlan({ ...old, birthYear: 1980, sellHomeAge: 50 }, NOW).sale.shb, false);
  assert.ok(buildPlan(old, NOW).payoutToday > buildPlan({ ...old, shb: false }, NOW).payoutToday, 'the committed amount raises CPF LIFE');
});

test('top-ups: tax saved follows the relief caps, and options are measured one at a time', () => {
  const t = compareTopUps({ salary: 9000, ...COUPLE }, NOW, 20000);
  const by = Object.fromEntries(t.options.map((o) => [o.key, o]));
  assert.equal(by.own.relief, 8000); assert.equal(by.partner.relief, 8000); assert.equal(by.srs.relief, 15300);
  assert.ok(by.srs.taxSaved > by.own.taxSaved && by.own.taxSaved > 0);
  assert.equal(by.own.taxSaved, taxSavedByTopUp(t.base, 8000));
  assert.ok(by.own.gainToday > 0 && by.partner.gainToday > 0 && by.srs.valueAt63Today > 0);
  assert.equal(t.maxRelief, 31300);
  assert.equal(compareTopUps({ salary: 9000 }, NOW, 8000).options.some((o) => o.key === 'partner'), false);
});

test('top-ups: self-employed top-ups count, and a full account turns them away', () => {
  const self = { work: 'self', tradeIncome: 60000, salary: 0 };
  assert.ok(buildPlan({ ...self, topUpYearly: 8000 }, NOW).payoutToday > buildPlan(self, NOW).payoutToday + 500);
  const full = buildPlan({ birthYear: 1976, sa: 228200, topUpYearly: 8000 }, NOW);
  assert.ok(full.rows.some((r) => r.topUpNotAccepted > 0));
});

test('confidence: seeded, ordered and centred on the plan', () => {
  const a = runConfidence({ housingMonthly: 1200 }, NOW, { runs: 120, band: 1 });
  const b = runConfidence({ housingMonthly: 1200 }, NOW, { runs: 120, band: 1 });
  assert.deepEqual(a.income, b.income);
  assert.ok(a.income.p10 <= a.income.p50 && a.income.p50 <= a.income.p90);
  assert.ok(Math.abs(a.income.p50 - a.base.incomeToday) / a.base.incomeToday < 0.05);
  assert.equal(a.hist.reduce((s, h) => s + h.count, 0), 120);
  const wide = runConfidence({ housingMonthly: 1200 }, NOW, { runs: 120, band: 1.5 });
  assert.ok(wide.income.p90 - wide.income.p10 > a.income.p90 - a.income.p10);
});
