// Fusion Studio: chapter model, plan version 2, and Studio's saved part surviving planner saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ANSWERS, buildPlan } from '../src/model/plan.js';
import { CHAPTERS, cleanStudio, todayScene, chapterWhen, buildingScene, turning55Scene, payoutScene, sumsForYear,
  makeMove, undoMove, myPlanScene, nextChapter, prevChapter, homeScene, laterScene, legacyScene, whatIf, KEY_CHAPTER, describeChange, familyScene } from '../src/model/studio.js';
import { taxSavedByRelief } from '../src/model/plan.js';
import { buildHousehold } from '../src/model/household.js';
import { interpolateCpfLife, raAtPayoutStart } from '../src/engine/cpfLife.js';
import { cleanState } from '../src/model/clients.js';

const NOW = new Date('2026-11-16T12:00:00+08:00');
const plan = (over = {}) => buildPlan({ ...DEFAULT_ANSWERS, ...over }, NOW);

test('chapters run in life order and end with My plan; all are built', () => {
  assert.deepEqual(CHAPTERS.map((c) => c.id), ['today', 'building', 'family', 'home', 'turning55', 'payout', 'later', 'legacy', 'plan']);
  assert.ok(CHAPTERS.every((c) => c.ready));
  assert.equal(nextChapter('building').id, 'family');
  assert.equal(nextChapter('payout').id, 'later');
  assert.equal(nextChapter('legacy').id, 'plan');
  assert.equal(nextChapter('plan'), null);
  assert.equal(prevChapter('home').id, 'family');
  assert.equal(prevChapter('today'), null);
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
  assert.deepEqual(s.moves[0].before, {});
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

test('Building: money in, interest and money out add up to the balance at 55', () => {
  for (const over of [{}, { birthYear: 1975, salary: 9000, oa: 150000, sa: 120000, ma: 60000, housingMonthly: 1200 }, { status: 'PR1', topUpYearly: 8000 }]) {
    const p = plan(over), b = buildingScene(p);
    assert.equal(b.until, 55);
    const sum = b.totalNow + b.moneyIn + b.interest - b.out;
    assert.ok(Math.abs(sum - b.endNominal) / b.endNominal < 0.005, `reconciles within 0.5% (${sum} vs ${b.endNominal})`);
    assert.ok(b.totalAt < b.endNominal, 'headline is in today\'s dollars');
    assert.equal(b.series.at(-1).age, 54);
  }
  const late = buildingScene(plan({ birthYear: 1963, work: 'none', oa: 300000, sa: 200000, ma: 70000 }));
  assert.equal(late.until, 65); // past 55: builds to the payout age
});

test('Turning 55: retirement sums, the S$5,000 rule and what can be taken out', () => {
  assert.deepEqual(sumsForYear(2026, 0.03), { BRS: 110200, FRS: 220400, ERS: 440800, BHS: 79000 });
  assert.equal(sumsForYear(2027, 0.03).FRS, 228200);
  const t = turning55Scene(plan({ birthYear: 1975, salary: 9000, oa: 150000, sa: 120000, ma: 60000 }));
  assert.equal(t.year55, 2030);
  assert.equal(t.sums.FRS, 249360); // 2027 FRS S$228,200 grown 3% a year to 2030
  assert.equal(t.sums.ERS, 2 * t.sums.FRS);
  assert.ok(t.metFrs);
  assert.equal(t.takeOut, t.savings - t.ra);
  const short = turning55Scene(plan({ birthYear: 1975, salary: 2000, oa: 20000, sa: 15000, ma: 10000 }));
  assert.ok(!short.metFrs);
  assert.ok(short.takeOut <= 5000);
  const done = turning55Scene(plan({ birthYear: 1963, work: 'none', oa: 300000, sa: 523000, ma: 70000 }));
  assert.equal(done.done, true);
  assert.equal(done.aboveErs, true);
  assert.equal(done.room, 0);
});

test('Payout: CPF LIFE figures are the engine estimator figures for the Retirement Account at payout', () => {
  const p = plan(), s = payoutScene(p);
  const ra = raAtPayoutStart(p.rows.find((r) => r.age === 65));
  for (const x of s.plans) assert.equal(x.nominal, Math.round(interpolateCpfLife(ra, x.key, true, 65)));
  assert.equal(s.life, p.payoutToday);
  assert.equal(s.income, s.life + s.oa + s.other);
  assert.equal(s.income, p.incomeToday);
});

test('Moves: only real changes are kept, labelled in plain words, and can be undone', () => {
  const a = { ...DEFAULT_ANSWERS };
  assert.equal(makeMove('payout', { payoutAge: 65 }, a), null); // same as the plan: no move
  const m = makeMove('payout', { payoutAge: 67, lifePlan: 'std', bogus: 1 }, a, '2026-11-16', 'm1');
  assert.deepEqual(m.change, { payoutAge: 67 });
  assert.deepEqual(m.before, { payoutAge: 65 });
  assert.equal(m.label, 'Start CPF LIFE at 67');
  assert.equal(makeMove('turning55', { topUpYearly: 8000 }, a).label, 'Top up S$8,000 a year in cash');
  const applied = { ...a, ...m.change };
  assert.equal(undoMove(applied, m).payoutAge, 65);
  assert.equal(undoMove({ ...applied, payoutAge: 69 }, m).payoutAge, 69); // changed since: left alone
});

test('My plan: each move shows what it adds, worked out by re-running the plan without it', () => {
  const a = { ...DEFAULT_ANSWERS };
  const m1 = makeMove('payout', { payoutAge: 67 }, a, 't', 'm1');
  const m2 = makeMove('turning55', { topUpYearly: 8000 }, a, 't', 'm2');
  const p = buildPlan({ ...a, ...m1.change, ...m2.change }, NOW);
  const s = myPlanScene(p, [m1, m2], NOW);
  assert.equal(s.moves[0].gain, p.incomeToday - buildPlan({ ...a, ...m2.change }, NOW).incomeToday);
  assert.ok(s.moves.every((x) => x.active && x.gain > 0));
  const changed = myPlanScene(buildPlan({ ...a, ...m2.change, payoutAge: 69 }, NOW), [m1, m2], NOW);
  assert.equal(changed.moves[0].active, false);
  assert.equal(changed.moves[0].gain, 0);
});

const HOME = { ownsHome: true, homeValue: 600000, cpfUsedForHome: 120000, housingMonthly: 1500, housingEndAge: 60, targetIncome: 4500 };

test('Home: the loan effect is the plan re-run without the loan; a sale adds the planner sale figures', () => {
  const p = plan(HOME), h = homeScene(p, NOW);
  assert.equal(h.loanEffect, p.incomeToday - plan({ ...HOME, housingMonthly: 0 }).incomeToday);
  assert.ok(h.loanEffect < 0);
  assert.equal(h.loanLeft, Math.round(p.rows.reduce((t, r) => t + (r.yearHousingOut || 0), 0)));
  assert.equal(h.sale, null);
  const sold = plan({ ...HOME, sellHomeAge: 66, nextHomeCost: 300000 }), hs = homeScene(sold, NOW);
  assert.equal(hs.sale.age, 66);
  assert.equal(hs.saleEffect, sold.incomeToday - plan({ ...HOME, sellHomeAge: 0, nextHomeCost: 300000 }).incomeToday);
  assert.equal(hs.saleParts.life + hs.saleParts.oa + hs.saleParts.other, hs.saleEffect);
  assert.equal(hs.shbOpen, true); // citizen selling at 55 or later
  assert.equal(homeScene(plan({ ...HOME, status: 'PR3', sellHomeAge: 66 }), NOW).shbOpen, false);
});

test('Later life: health costs and the worst of the five worse cases', () => {
  const l = laterScene(plan(), NOW);
  assert.equal(l.cases.length, 5);
  assert.equal(l.worst.delta, Math.min(...l.cases.map((c) => c.delta)));
  assert.ok(l.health.points.length > 0);
});

test('Legacy: what is left adds Ordinary Account savings and unused CPF LIFE premium', () => {
  const g = legacyScene(plan());
  assert.deepEqual(g.left.map((x) => x.age), [75, 80, 85, 90, 95]);
  for (const x of g.left) assert.equal(x.total, x.oa + (x.life || 0));
  assert.equal(g.at85.age, 85);
  const kept = legacyScene(plan({ oaKeep: 100000 }));
  assert.ok(kept.at85.oa > g.at85.oa, 'keeping savings back leaves more');
  assert.equal(legacyScene(plan({ lifePlan: 'bas' })).basic, true);
});

test('What if: best moves and target answers open the chapter that owns the setting', () => {
  const w = whatIf({ ...DEFAULT_ANSWERS, targetIncome: 4500 }, NOW);
  assert.ok(w.best.length > 0 && w.best.length <= 3);
  for (const m of w.best) {
    assert.ok(m.gain > 0);
    for (const k of Object.keys(m.change)) assert.equal(KEY_CHAPTER[k], m.chapter);
    assert.ok(CHAPTERS.find((c) => c.id === m.chapter).ready, `${m.chapter} is built`);
  }
  assert.equal(w.topUp.chapter, 'turning55');
  assert.ok(w.topUp.amount > 0);
  // every setting a chapter can change has plain words
  for (const k of Object.keys(KEY_CHAPTER)) assert.doesNotMatch(describeChange(k, DEFAULT_ANSWERS[k] || 1), new RegExp(`^${k}:`));
});

test('Family: household income from each person\'s own plan; parents\' top-ups change tax only', () => {
  const a = { hasPartner: true, pBirthYear: 1993, pSalary: 5000, pOa: 40000, pSa: 30000, pMa: 25000, targetIncome: 6000 };
  const p = plan(a), f = familyScene(p, NOW);
  const h = buildHousehold({ ...DEFAULT_ANSWERS, ...a }, NOW);
  assert.equal(f.household, h.incomeToday);
  assert.equal(f.household, f.you + f.partner);
  assert.equal(f.taxSaved, 0);
  const withTop = plan({ ...a, parentTopUpYearly: 10000 });
  assert.equal(withTop.incomeToday, p.incomeToday, 'your own CPF is unchanged');
  const ft = familyScene(withTop, NOW);
  assert.equal(ft.parentRelief, 8000); // relief capped at S$8,000 for loved ones
  assert.equal(ft.taxSaved, taxSavedByRelief(withTop, 8000));
  // separate from the S$8,000 for your own top-up: worked out at the margin above it
  const both = familyScene(plan({ ...a, parentTopUpYearly: 8000, topUpYearly: 8000 }), NOW);
  assert.equal(both.taxSaved, taxSavedByRelief(plan({ ...a, topUpYearly: 8000 }), 16000) - taxSavedByRelief(plan({ ...a, topUpYearly: 8000 }), 8000));
  assert.equal(makeMove('family', { parentTopUpYearly: 6000 }, DEFAULT_ANSWERS).label, "Top up your parents' CPF by S$6,000 a year in cash");
});
