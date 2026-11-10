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
