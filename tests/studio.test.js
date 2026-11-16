// Fusion Studio: chapter model, plan version 2, and Studio's saved part surviving planner saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ANSWERS, buildPlan } from '../src/model/plan.js';
import { CHAPTERS, cleanStudio, todayScene, chapterWhen } from '../src/model/studio.js';
import { cleanState } from '../src/model/clients.js';

const NOW = new Date('2026-11-16T12:00:00+08:00');
const plan = (over = {}) => buildPlan({ ...DEFAULT_ANSWERS, ...over }, NOW);

test('chapters run in life order and end with My plan; only Today is built in Phase 0', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.id), ['today', 'building', 'family', 'home', 'turning55', 'payout', 'later', 'legacy', 'plan']);
  assert.deepEqual(CHAPTERS.filter((c) => c.ready).map((c) => c.id), ['today']);
  for (const c of CHAPTERS) assert.match(c.question, /\?$/, `${c.id} opens with a question`);
});

test('cleanStudio: defaults, unknown chapters, and moves limited to known answer fields', () => {
  assert.deepEqual(cleanStudio(null), { chapter: 'today', moves: [] });
  assert.equal(cleanStudio({ chapter: 'nowhere' }).chapter, 'today');
  assert.equal(cleanStudio({ chapter: 'payout' }).chapter, 'payout');
  const s = cleanStudio({ moves: [
    { id: 'm1', label: 'Top up S$8,000 a year', chapter: 'payout', at: '2026-11-16', change: { topUpYearly: 8000, evil: 'x', salary: 'lots' } },
    { id: 2, label: 'bad id' }, null,
  ] });
  assert.equal(s.moves.length, 1);
  assert.deepEqual(s.moves[0].change, { topUpYearly: 8000 }); // unknown key and wrong type dropped
  assert.equal(cleanStudio({ moves: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, label: 'x' })) }).moves.length, 20);
});

test('plan version 2: a version 1 plan opens unchanged with Studio defaults; Studio data is kept', () => {
  const v1 = { v: 1, answers: { ...DEFAULT_ANSWERS, salary: 7000 }, done: true, tried: {}, scenarios: [] };
  const c = cleanState(v1);
  assert.equal(c.answers.salary, 7000);
  assert.equal(c.done, true);
  assert.deepEqual(c.studio, { chapter: 'today', moves: [] });
  const v2 = cleanState({ ...v1, v: 2, studio: { chapter: 'home', moves: [{ id: 'm1', label: 'Sell at 65', change: { sellHomeAge: 65 } }] } });
  assert.equal(v2.studio.chapter, 'home');
  assert.equal(v2.studio.moves[0].change.sellHomeAge, 65);
});

test('Today: totals and contributions come from the engine', () => {
  const p = plan();
  const t = todayScene(p);
  assert.equal(t.total, DEFAULT_ANSWERS.oa + DEFAULT_ANSWERS.sa + DEFAULT_ANSWERS.ma);
  assert.equal(t.yearIn, Math.round(p.rows[0].yearMandatory));
  // Citizen, age 35, S$6,000 a month + 1 month bonus: 37% of S$78,000 (2026 rates, under the ceilings)
  assert.equal(t.yearIn, 28860);
  assert.ok(Math.abs(t.split.reduce((s, x) => s + x.yearly, 0) - t.yearIn) <= 2, 'account split adds up');
  assert.equal(t.income, p.incomeToday);
  assert.equal(t.lifeIncome + t.oaIncome + t.otherIncome, t.income);
});

test('Today: first-year PR uses the graduated rates (engine figure, not recomputed)', () => {
  const t = todayScene(plan({ status: 'PR1' }));
  assert.equal(t.yearIn, 7020); // 4% employer + 5% employee of S$78,000
});

test('Today: income gap and spare income, one or the other', () => {
  const short = todayScene(plan({ targetIncome: 9000 }));
  assert.equal(short.status, 'gap');
  assert.equal(short.gap, 9000 - short.income);
  assert.equal(short.above, 0);
  const ok = todayScene(plan({ targetIncome: 1000 }));
  assert.equal(ok.status, 'on-track');
  assert.equal(ok.gap, 0);
  assert.equal(ok.above, ok.income - 1000);
  assert.equal(todayScene(plan({ targetIncome: 0 })).status, 'no-target');
});

test('Today: from 55 the second account is the Retirement Account', () => {
  const t = todayScene(plan({ birthYear: 1968 }));
  assert.equal(t.after55, true);
  assert.equal(t.accounts[1].name, 'Retirement Account');
  assert.equal(chapterWhen('turning55', plan({ birthYear: 1968 })), 'done');
  assert.equal(chapterWhen('turning55', plan()), 'in 2046');
});

test('savePlan: the planner keeps what Studio saved; Studio writes its own part', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.document = { cookie: '', documentElement: { getAttribute: () => null, setAttribute: () => {} } };
  const { savePlan, loadPlan, PLAN_KEY, PLAN_VERSION } = await import('../src/next/storage.js');
  const base = cleanState({ answers: DEFAULT_ANSWERS, done: true });

  savePlan({ ...base, studio: { chapter: 'payout', moves: [{ id: 'm1', label: 'Top up', change: { topUpYearly: 8000 } }] } }, { from: 'studio' });
  assert.equal(JSON.parse(store.get(PLAN_KEY)).v, PLAN_VERSION);
  // A planner tab opened before that save still holds the old Studio part; saving must not wipe the move.
  savePlan({ ...base, answers: { ...base.answers, salary: 9000 } });
  const back = loadPlan();
  assert.equal(back.answers.salary, 9000);
  assert.equal(back.studio.chapter, 'payout');
  assert.equal(back.studio.moves.length, 1);
  // Studio can change its own part.
  savePlan({ ...back, studio: { chapter: 'today', moves: [] } }, { from: 'studio' });
  assert.deepEqual(loadPlan().studio, { chapter: 'today', moves: [] });
  delete globalThis.localStorage; delete globalThis.document;
});
