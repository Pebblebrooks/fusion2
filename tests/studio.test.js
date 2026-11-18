// Fusion Studio: chapter model, plan version 2, and Studio's saved part surviving planner saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ANSWERS, buildPlan } from '../src/model/plan.js';
import { CHAPTERS, cleanStudio, todayScene, chapterWhen, buildingScene, turning55Scene, payoutScene, sumsForYear,
  makeMove, undoMove, myPlanScene, nextChapter, prevChapter, homeScene, laterScene, legacyScene, whatIf, KEY_CHAPTER, describeChange, familyScene,
  budgetScene, solvePayoutAge, solveFrsTopUp } from '../src/model/studio.js';
import { cleanLifeEvents } from '../src/model/plan.js';
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

test('Family: tuition paid and repaid, and transfers limited by the retirement sum kept back', async () => {
  const a = { birthYear: 1984, salary: 7500, oa: 82000, sa: 61000, ma: 48000, eduYearly: 10000, eduStartAge: 55, eduYears: 4, lovedTransferYearly: 6000, lovedFromAge: 45, lovedYears: 5 };
  const p = plan(a), f = familyScene(p, NOW);
  assert.equal(f.edu.from, 55);
  assert.equal(f.edu.years, 4);
  assert.ok(f.edu.repaid > f.edu.paid, 'repaid with interest');
  assert.equal(f.edu.repayFrom, 60); // a year after the course ends
  assert.equal(f.edu.repayTo - f.edu.repayFrom + 1, 12);
  assert.equal(f.loved.sent + f.loved.short, 6000 * 5);
  assert.ok(f.loved.short > 0, 'CPF keeps the Full Retirement Sum back first');
  assert.equal(familyScene(plan({}), NOW).edu, null);
  // Tuition is entered in today's dollars and raised with prices to the year fees start
  assert.equal(p.inputs.oaEduLoan, Math.round(10000 * Math.pow(1.02, 55 - p.age)));
  // The classic planner link carries the new settings (share links keep only known settings)
  const { encodePlanState, decodePlanState } = await import('../src/state/shareLink.js');
  const { toEngineInputs } = await import('../src/model/plan.js');
  const inputs = toEngineInputs({ ...DEFAULT_ANSWERS, ...a }, NOW);
  const back = JSON.parse(decodePlanState(encodePlanState(JSON.stringify({ appVersion: 'V4-2026', inputs }))));
  const { DEFAULT_INPUTS } = await import('../src/inputs/defaults.js');
  const got = { ...DEFAULT_INPUTS, ...back.inputs }; // links carry only what differs from the defaults
  for (const k of ['oaEduStartAge', 'oaEduRepayYears', 'oaToLovedOneYearly', 'lovedOneFromAge', 'lovedOneYears']) assert.equal(got[k], inputs[k], k);
});

test('Phase 3 batch A: new settings reach the engine and respect CPF limits', () => {
  const p0 = plan({});
  // Voluntary contributions: money in rises, never past the S$37,740 annual limit
  const vc = plan({ vc3aYearly: 50000 });
  const r0 = vc.rows[0];
  assert.ok(r0.injected > p0.rows[0].injected);
  assert.ok(r0.yearMandatory + r0.yearVoluntary <= 37740 + 1, `${r0.yearMandatory} + ${r0.yearVoluntary}`);
  // Ordinary Account to MediSave: from 55 only, and only up to the Basic Healthcare Sum
  const low = { birthYear: 1968, ma: 10000, oa: 300000, sa: 250000, work: 'none' }; // 58, MediSave well below the BHS
  const ma = plan({ ...low, oaToMaYearly: 10000 }), noMa = plan(low);
  assert.ok(ma.rows[0].ma > noMa.rows[0].ma && ma.rows[0].oa < noMa.rows[0].oa, 'moves from 55');
  assert.equal(plan({ oaToMaYearly: 10000 }).rows[0].oa, p0.rows[0].oa, 'not before 55');
  assert.ok(Math.max(...plan({ ...low, oaToMaYearly: 50000 }).rows.map((r) => r.ma)) <= 130000, 'stops at the Basic Healthcare Sum');
  // Dependants' Protection: opting out leaves the premium in the Ordinary Account
  assert.ok(plan({ dpsCover: false }).rows[0].oa > p0.rows[0].oa);
  // Home Protection: charged only while a CPF home loan runs
  const loan = { ownsHome: true, homeValue: 500000, housingMonthly: 1000, housingEndAge: 60 };
  assert.ok(plan({ ...loan, hpsYearly: 400 }).rows[0].oa < plan(loan).rows[0].oa);
  assert.equal(plan({ hpsYearly: 400 }).inputs.hpsAnnualPremium, 0);
  // Pledge: needs a home; keeps only the BRS at 55 and lets the member take more out
  assert.equal(plan({ pledge: true }).inputs.usePropertyPledge, false);
  const home = { ownsHome: true, homeValue: 600000 };
  const pledged = plan({ ...home, pledge: true, withdrawAt55: 2000000 }), t = turning55Scene(pledged);
  assert.equal(t.pledge, true);
  assert.ok(t.withdrawn > turning55Scene(plan({ ...home, withdrawAt55: 2000000 })).withdrawn, 'pledge lets more out at 55');
  assert.ok(pledged.payoutToday < plan(home).payoutToday, 'pledge lowers CPF LIFE');
  for (const k of ['vc3aYearly', 'oaToMaYearly', 'dpsCover', 'withdrawAt55', 'pledge']) assert.ok(KEY_CHAPTER[k], k);
});

test('Phase 3 batch B: money outside CPF, die with zero, life events, budget and goal answers', () => {
  const p0 = plan({});
  // Savings pot grows, and counts as income only when chosen
  const sv = plan({ savingsNow: 100000, savingsYearly: 10000 });
  assert.ok(sv.savingsAtPayoutToday > 100000);
  assert.equal(sv.savingsMonthlyToday, 0);
  assert.equal(sv.incomeToday, p0.incomeToday);
  const spent = plan({ savingsNow: 100000, savingsYearly: 10000, spendSavings: true });
  assert.ok(spent.savingsMonthlyToday > 0);
  assert.equal(spent.incomeToday, p0.incomeToday + spent.savingsMonthlyToday);
  // A Silver Housing Bonus is counted in the sale, not again as savings
  const shb = plan({ birthYear: 1965, work: 'none', oa: 200000, sa: 150000, ma: 60000, ownsHome: true, homeValue: 500000, sellHomeAge: 63, shb: true, shbCommit: 60000, payoutAge: 65 });
  assert.ok(shb.sale && shb.sale.bonus > 0, 'bonus paid');
  assert.ok(shb.savingsAtPayoutToday < 1000, `not double counted: ${shb.savingsAtPayoutToday}`);
  // Die with zero: everything spread to the chosen age, nothing kept back
  const dwz = plan({ savingsNow: 50000, dieWithZero: true, dieWithZeroAge: 85, oaKeep: 30000 });
  assert.equal(dwz.spreadTo, 85);
  assert.ok(dwz.savingsMonthlyToday > 0);
  assert.equal(legacyScene(dwz).left.find((x) => x.age === 90).oa, 0);
  // Life events
  const ev = (e) => plan({ savingsNow: 50000, lifeEvents: [e] });
  const job = ev({ type: 'retrenchment', startAge: 40, endAge: 41, amount: 0 });
  assert.equal(job.rows.find((r) => r.age === 40).yearMandatory, 0);
  const med = ev({ type: 'medical_crisis', startAge: 40, endAge: 40, amount: 20000 });
  const noMed = plan({ savingsNow: 50000 });
  assert.equal(med.rows.find((r) => r.age === 40).oa, noMed.rows.find((r) => r.age === 40).oa, 'medical bills not from the OA');
  assert.ok(med.rows.find((r) => r.age === 40).privateAssets < noMed.rows.find((r) => r.age === 40).privateAssets);
  const win = ev({ type: 'windfall', startAge: 45, amount: 100000 });
  assert.ok(win.savingsAtPayoutToday > noMed.savingsAtPayoutToday + 50000);
  assert.deepEqual(cleanLifeEvents([{ type: 'nope' }, { type: 'windfall', startAge: 50, endAge: 60, amount: -5 }], 35), [{ type: 'windfall', startAge: 50, endAge: 50, amount: 0 }]);
  // Budget: citizen aged 35 on S$6,000 pays 20% employee CPF
  const b = budgetScene(plan({ monthlySpend: 3000, insuranceYearly: 2400 }));
  assert.deepEqual([b.cpf, b.takeHome, b.insurance, b.left], [1200, 4800, 200, 1600]);
  assert.equal(budgetScene(plan({ status: 'PR1' })).cpf, 300); // PR year 1: 5%
  // Goal answers
  const pa = solvePayoutAge({ ...DEFAULT_ANSWERS, targetIncome: 3900 }, NOW);
  assert.ok(pa === null || (pa >= 65 && pa <= 70));
  if (pa) assert.equal(plan({ targetIncome: 3900, payoutAge: pa }).gapToday, 0);
  const low = { ...DEFAULT_ANSWERS, salary: 3000, oa: 10000, sa: 5000, ma: 8000 };
  const frs = solveFrsTopUp(low, NOW);
  assert.ok(frs.possible && frs.amount > 0);
  assert.ok(buildPlan({ ...low, topUpYearly: frs.amount }, NOW).frsCoverage >= 0.999);
  for (const k of ['savingsYearly', 'spendSavings', 'dieWithZero']) assert.ok(KEY_CHAPTER[k], k);
});

test('CPF rules of 18 Nov in Studio: Lease Buyback, CPFIS, payout-start transfer, legacy', () => {
  const older = { birthYear: 1964, work: 'none', oa: 60000, sa: 140000, ma: 50000, ownsHome: true, homeValue: 450000, targetIncome: 2500 };
  const lbs = plan({ ...older, lbsAge: 66, lbsProceeds: 90000, lbsFlat: '3r' });
  assert.ok(lbs.lbs && lbs.lbs.topUp > 0 && lbs.lbs.bonus > 0, 'LBS summary');
  assert.ok(lbs.payoutToday > plan(older).payoutToday || lbs.lbs.age > lbs.payoutAge, 'top-up raises CPF LIFE when before payouts');
  assert.equal(plan({ ...older, lbsAge: 66, lbsProceeds: 90000, sellHomeAge: 70 }).lbs, null, 'no LBS when selling');
  assert.equal(plan({ ...older, status: 'PR3', lbsAge: 66, lbsProceeds: 90000 }).lbs, null, 'citizens only');
  // Below the FRS at payout: OA moves to the RA when payouts start
  assert.ok(plan(older).oaToRaAtPayoutToday > 0);
  // CPFIS: kept investments go to the family; a 30% fall is one of the worse cases
  const inv = plan({ cpfisHeld: 40000, cpfisReturn: 5 });
  assert.ok(inv.cpfis && inv.cpfis.atPayoutToday > 40000);
  assert.ok(legacyScene(inv).at85.inv > 0);
  assert.ok(laterScene(inv).cases.some((c) => c.key === 'invest'));
  const sold = plan({ cpfisHeld: 40000, cpfisReturn: 5, cpfisSellAge: 60 });
  assert.equal(sold.cpfis.soldAt, 60);
  for (const k of ['lbsAge', 'cpfisYearly', 'cpfisSellAge', 'lovedRecipientRoom']) { assert.ok(KEY_CHAPTER[k], k); assert.ok(!describeChange(k, 1).startsWith(k), k); }
});
