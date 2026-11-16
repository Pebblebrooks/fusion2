/**
 * Fusion Studio: the life story, chapter by chapter. Pure functions only, so they can be tested.
 * Every figure comes from buildPlan (src/model/plan.js), which runs the same CPF engine as the
 * planner and the classic planner. Screens never work numbers out themselves.
 */
import { DEFAULT_ANSWERS, buildPlan, findMoves, stressTests, taxSavedByTopUp, taxSavedByRelief, RSTU_RELIEF_CAP } from './plan.js';
import { healthcare, drawdown, solveStopWork, solveTopUp, buildHousehold } from './household.js';
import { RETIREMENT_SUMS_2026, RETIREMENT_SUMS_2027, projectedSum, SHB } from '../policy/cpf2026.js';

/** Chapters in life order. `ready` = built in this release; the rest show as coming. */
export const CHAPTERS = [
  { id: 'today', title: 'Today', question: 'Where do I stand today?', ready: true },
  { id: 'building', title: 'Building', question: 'Will my savings grow enough?', ready: true },
  { id: 'family', title: 'Family', question: 'What do my children and parents cost me?', ready: true },
  { id: 'home', title: 'Home', question: 'How much CPF does my home use?', ready: true },
  { id: 'turning55', title: 'Turning 55', question: 'What happens to my CPF at 55?', ready: true },
  { id: 'payout', title: 'Payout', question: 'How much will I get each month?', ready: true },
  { id: 'later', title: 'Later life', question: 'Can I cope with health costs and shocks?', ready: true },
  { id: 'legacy', title: 'Legacy', question: 'What will I leave behind?', ready: true },
  { id: 'plan', title: 'My plan', question: 'What am I going to do?', ready: true },
];
export const CHAPTER_IDS = CHAPTERS.map((c) => c.id);

const MAX_MOVES = 20;
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Only answer keys the planner knows, with the same types, are kept in a saved move. */
const cleanChange = (change) => {
  const out = {};
  if (!change || typeof change !== 'object') return out;
  for (const k of Object.keys(DEFAULT_ANSWERS)) if (typeof change[k] === typeof DEFAULT_ANSWERS[k]) out[k] = change[k];
  return out;
};

/**
 * Studio's part of the saved plan (plan version 2). Plans saved before Studio have none, and get the defaults.
 *   chapter — where the user was, so Studio reopens there
 *   moves   — changes saved from chapters for the My plan page: { id, chapter, label, at, change, before }
 *             (`before` = the plan's values the move replaced, so it can be undone)
 */
export const cleanStudio = (s) => ({
  chapter: CHAPTER_IDS.includes(s?.chapter) ? s.chapter : 'today',
  moves: (Array.isArray(s?.moves) ? s.moves : [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.label === 'string')
    .slice(0, MAX_MOVES)
    .map((m) => ({ id: str(m.id, 40), chapter: CHAPTER_IDS.includes(m.chapter) ? m.chapter : 'today', label: str(m.label, 120), at: str(m.at, 30), change: cleanChange(m.change), before: cleanChange(m.before) })),
});

/** Timeline label under each chapter: when in life it happens. */
export const chapterWhen = (id, plan) => {
  const pa = plan.payoutAge;
  switch (id) {
    case 'today': return `age ${plan.age}`;
    case 'building': return plan.age < 55 ? `to 55` : 'now';
    case 'turning55': return plan.age < 55 ? `in ${plan.year55}` : 'done';
    case 'payout': return `from ${pa}`;
    case 'later': return `${pa}+`;
    default: return '';
  }
};

/**
 * Today chapter: where the user stands now, and what that leads to.
 * Contributions are the engine's own figure for this year, so PR graduated rates and the
 * wage ceilings are already applied; the account split follows this year's allocation.
 */
export const todayScene = (plan) => {
  const a = plan.answers;
  const after55 = plan.age >= 55;
  const accounts = [
    { key: 'oa', name: 'Ordinary Account', short: 'OA', amount: Number(a.oa) || 0, use: 'Home, education, investment' },
    { key: 'sa', name: after55 ? 'Retirement Account' : 'Special Account', short: after55 ? 'RA' : 'SA', amount: Number(a.sa) || 0, use: 'Retirement income' },
    { key: 'ma', name: 'MediSave Account', short: 'MA', amount: Number(a.ma) || 0, use: 'Healthcare and insurance' },
  ];
  const total = accounts.reduce((s, x) => s + x.amount, 0);

  const yearIn = Math.round(Number(plan.rows[0]?.yearMandatory) || 0);
  const alloc = [plan.inputs.empOaCont, plan.inputs.empSaCont, plan.inputs.empMaCont].map((v) => Number(v) || 0);
  const allocSum = alloc.reduce((s, v) => s + v, 0);
  const split = accounts.map((x, i) => ({ key: x.key, short: x.short, yearly: allocSum > 0 ? Math.round((yearIn * alloc[i]) / allocSum) : 0 }));

  const target = plan.target;
  const income = plan.incomeToday;
  const gap = plan.gapToday;
  const above = target > 0 ? Math.max(0, income - target) : 0;
  const status = target <= 0 ? 'no-target' : gap > 0 ? 'gap' : 'on-track';

  return {
    age: plan.age, after55, accounts, total,
    yearIn, monthIn: Math.round(yearIn / 12), split,
    payoutAge: plan.payoutAge, income, lifeIncome: plan.payoutToday, oaIncome: plan.oaMonthlyToday, otherIncome: plan.otherMonthlyToday,
    target, gap, above, status, coverage: plan.coverage,
    spreadTo: plan.spreadTo, inflation: plan.assumptions.inflation,
  };
};

/* ── Helpers shared by the scenes ────────────────────────────────────────── */
const money = (v) => `S$${Math.round(Number(v) || 0).toLocaleString('en-SG')}`;
/** Next and previous built chapter, for the buttons at the foot of each scene. */
export const nextChapter = (id) => CHAPTERS.slice(CHAPTERS.findIndex((c) => c.id === id) + 1).find((c) => c.ready) || null;
export const prevChapter = (id) => [...CHAPTERS.slice(0, CHAPTERS.findIndex((c) => c.id === id))].reverse().find((c) => c.ready) || null;

/* ── Chapter 2: Building ─────────────────────────────────────────────────── */
/**
 * Growth from today to 55 (or to the payout age once past 55).
 * Headline in today's dollars. The breakdown uses the engine's own yearly totals (money in,
 * interest, money out) in the dollars of each year, so it adds up to the balance it explains.
 */
export const buildingScene = (plan) => {
  const until = plan.age < 55 ? 55 : Math.max(plan.payoutAge, plan.age);
  const rows = plan.rows.filter((r) => r.age >= plan.age && r.age < until);
  let moneyIn = 0, interest = 0, out = 0;
  for (const r of rows) { moneyIn += Number(r.injected) || 0; interest += Number(r.interest) || 0; out += Number(r.outflow) || 0; }
  const end = plan.series.find((x) => x.age === until - 1);
  const totalAt = end ? Math.round(end.total) : plan.totalNow;
  const series = plan.series.filter((x) => x.age < until);
  const milestones = series.filter((x) => (x.age + 1 - plan.age) % 5 === 0 || x.age === until - 1)
    .map((x) => ({ age: x.age + 1, oa: Math.round(x.oa), retire: Math.round(x.retire), ma: Math.round(x.ma), total: Math.round(x.total) }));
  return {
    age: plan.age, until, done: rows.length === 0, totalNow: plan.totalNow, totalAt,
    multiple: plan.totalNow > 0 ? totalAt / plan.totalNow : null,
    moneyIn: Math.round(moneyIn), interest: Math.round(interest), out: Math.round(out),
    endNominal: Math.round(rows.at(-1)?.total ?? plan.totalNow), yearEnd: plan.answers.birthYear + until,
    stopWorkAge: plan.inputs.contributionStopAge, series, milestones,
  };
};

/* ── Chapter 5: Turning 55 ───────────────────────────────────────────────── */
/** Retirement sums in force in a calendar year: official for 2026 and 2027, projected after that. */
export const sumsForYear = (year, growth) => {
  if (year <= 2026) return { ...RETIREMENT_SUMS_2026 };
  if (year === 2027) return { ...RETIREMENT_SUMS_2027, BHS: RETIREMENT_SUMS_2026.BHS };
  const n = year - 2026;
  return { BRS: Math.round(projectedSum('BRS', growth, n)), FRS: Math.round(projectedSum('FRS', growth, n)), ERS: Math.round(projectedSum('ERS', growth, n)) };
};

/**
 * At 55 the Retirement Account is formed, up to the Full Retirement Sum, from Special then Ordinary
 * Account savings. Savings above it can be taken out from 55; below it, up to S$5,000.
 * Amounts are in the dollars of the year you turn 55 (retirement sums are set in those dollars).
 */
export const turning55Scene = (plan) => {
  const a = plan.answers, g = plan.assumptions.sumGrowth;
  if (plan.age >= 55) {
    const sums = sumsForYear(plan.year, g);
    const ra = Number(a.sa) || 0;
    return { done: true, year55: plan.year55, year: plan.year, ra, sums, coverage: sums.FRS > 0 ? ra / sums.FRS : 0,
      room: Math.max(0, sums.ERS - ra), aboveErs: ra > sums.ERS };
  }
  const frs = plan.frs55, sums = { BRS: Math.round(frs / 2), FRS: Math.round(frs), ERS: Math.round(frs * 2) };
  const before = plan.rows.find((r) => r.age === 54) || { oa: Number(a.oa) || 0, sa: Number(a.sa) || 0 };
  const savings = Math.round((Number(before.oa) || 0) + (Number(before.sa) || 0));
  const ra = Math.round(plan.raAt55);
  const left = Math.max(0, savings - ra);
  const metFrs = ra >= frs - 1;
  return {
    done: false, year55: plan.year55, yearsTo: 55 - plan.age, ra, sums, savings, coverage: plan.frsCoverage, metFrs,
    takeOut: metFrs ? left : Math.min(5000, left), stays: metFrs ? 0 : Math.max(0, left - 5000),
  };
};

/* ── Chapter 6: Payout ───────────────────────────────────────────────────── */
const PLAN_NAMES = { std: 'Standard', esc: 'Escalating', bas: 'Basic' };
export const payoutScene = (plan) => {
  const toToday = plan.payout > 0 ? plan.payoutToday / plan.payout : 1;
  return {
    payoutAge: plan.payoutAge, yearPayout: plan.yearPayout, lifePlan: plan.answers.lifePlan, planName: PLAN_NAMES[plan.answers.lifePlan] || 'Standard',
    income: plan.incomeToday, life: plan.payoutToday, oa: plan.oaMonthlyToday, other: plan.otherMonthlyToday, spreadTo: plan.spreadTo,
    target: plan.target, gap: plan.gapToday, above: plan.target > 0 ? Math.max(0, plan.incomeToday - plan.target) : 0,
    status: plan.target <= 0 ? 'no-target' : plan.gapToday > 0 ? 'gap' : 'on-track',
    raAtPayout: Math.round(plan.raAtPayout),
    plans: ['std', 'esc', 'bas'].map((k) => ({ key: k, name: PLAN_NAMES[k], nominal: plan.payouts[k], today: Math.round(plan.payouts[k] * toToday) })),
  };
};

/* ── Moves: changes saved from a chapter ─────────────────────────────────── */
/** Plain words for one change, used as the move's name on My plan. */
export const describeChange = (key, value, plan) => {
  switch (key) {
    case 'topUpYearly': return value > 0 ? `Top up ${money(value)} a year in cash` : 'Stop cash top-ups';
    case 'oaToSaYearly': return value > 0 ? `Move ${money(value)} a year from Ordinary to Special Account` : 'Stop moving Ordinary Account savings';
    case 'stopWorkAge': return `Stop work at ${value}`;
    case 'realPayGrowth': return `Pay rises ${value}% a year above prices`;
    case 'payoutAge': return `Start CPF LIFE at ${value}`;
    case 'lifePlan': return `Choose the CPF LIFE ${PLAN_NAMES[value] || value} plan`;
    case 'oaSpreadTo': return `Spend Ordinary Account savings to age ${value}`;
    case 'housingMonthly': return value > 0 ? `Pay ${money(value)} a month of your home loan from CPF` : 'Pay your home loan in cash, not from CPF';
    case 'sellHomeAge': return value > 0 ? `Sell your home at ${value}` : 'Keep your home';
    case 'nextHomeCost': return value > 0 ? `Next home costing ${money(value)} in today's prices` : 'No next home to buy';
    case 'loanOwedAtSale': return `${money(value)} of home loan left when you sell`;
    case 'shb': return value ? 'Claim the Silver Housing Bonus' : 'No Silver Housing Bonus';
    case 'shbNextFlat': return value === '2r' ? 'Move to a 2-room or smaller flat' : 'Move to a 3-room flat';
    case 'shbCommit': return `Commit ${money(value)} to your Retirement Account`;
    case 'medInflation': return `Medical costs rise ${value}% a year`;
    case 'ipPrivate': return value > 0 ? `Integrated Shield private part ${money(value)} a year` : 'MediShield Life only';
    case 'medUsage': return `Medical bills of ${money(value)} a year from MediSave`;
    case 'parentTopUpYearly': return value > 0 ? `Top up your parents' CPF by ${money(value)} a year in cash` : 'No cash top-ups for your parents';
    case 'eduYearly': return value > 0 ? `Pay ${money(value)} a year of tuition from your Ordinary Account` : 'No tuition from your Ordinary Account';
    case 'eduStartAge': return `Tuition starts when you are ${value}`;
    case 'eduYears': return `${value} years of study`;
    case 'eduRepayYears': return `Repaid over ${value} years`;
    case 'lovedTransferYearly': return value > 0 ? `Transfer ${money(value)} a year from your Ordinary Account to a loved one` : 'No CPF transfers to loved ones';
    case 'lovedRelation': return `Transfers go to your ${value === 'spouse' ? 'spouse' : value === 'other' ? 'sibling or in-law' : 'parents or grandparents'}`;
    case 'lovedFromAge': return `Transfers start at ${value}`;
    case 'lovedYears': return `Transfers for ${value} years`;
    case 'oaKeep': return value > 0 ? `Keep ${money(value)} of Ordinary Account savings untouched` : 'Spend all Ordinary Account savings';
    default: return `${key}: ${value}`;
  }
};

/** A move from the changes tried in a chapter. Only changes that differ from the plan are kept. */
export const makeMove = (chapter, trial, answers, at = new Date().toISOString(), id = `m${Date.now().toString(36)}`) => {
  const change = {}, before = {};
  for (const [k, v] of Object.entries(trial || {})) {
    if (k in DEFAULT_ANSWERS && answers[k] !== v) { change[k] = v; before[k] = answers[k]; }
  }
  if (!Object.keys(change).length) return null;
  const label = Object.entries(change).map(([k, v]) => describeChange(k, v)).join('; ');
  return { id, chapter, label, at, change, before };
};

/** Undo a move: put back the values it replaced, where the plan still holds the move's values. */
export const undoMove = (answers, move) => {
  const out = { ...answers };
  for (const [k, v] of Object.entries(move.change)) if (out[k] === v && k in move.before) out[k] = move.before[k];
  return out;
};

/* ── Chapter 9: My plan ──────────────────────────────────────────────────── */
/** Each saved move with what it adds to monthly income now (plan with it, against the plan without it). */
export const myPlanScene = (plan, moves, now = new Date()) => {
  const list = moves.map((m) => {
    const without = buildPlan(undoMove(plan.answers, m), now);
    const active = Object.entries(m.change).every(([k, v]) => plan.answers[k] === v);
    return { ...m, active, gain: active ? plan.incomeToday - without.incomeToday : 0 };
  });
  return {
    moves: list, income: plan.incomeToday, target: plan.target, gap: plan.gapToday,
    above: plan.target > 0 ? Math.max(0, plan.incomeToday - plan.target) : 0,
    status: plan.target <= 0 ? 'no-target' : plan.gapToday > 0 ? 'gap' : 'on-track',
    payoutAge: plan.payoutAge, life: plan.payoutToday, oa: plan.oaMonthlyToday, frsCoverage: plan.frsCoverage, age: plan.age,
  };
};

/* ── Chapter 4: Home ─────────────────────────────────────────────────────── */
/**
 * What the home loan takes from the Ordinary Account, what that does to income, and (when a sale is
 * in the plan) where the sale money goes. Each effect is the plan re-run without it.
 */
export const homeScene = (plan, now = new Date()) => {
  const a = plan.answers, stop = plan.inputs.housingStopAge;
  const loanLeft = Math.round(plan.rows.filter((r) => r.age >= plan.age).reduce((t, r) => t + (Number(r.yearHousingOut) || 0), 0));
  const noLoan = a.housingMonthly > 0 ? buildPlan({ ...a, housingMonthly: 0 }, now) : null;
  const keep = plan.sale ? buildPlan({ ...a, sellHomeAge: 0 }, now) : null;
  return {
    owns: !!a.ownsHome, monthly: Number(a.housingMonthly) || 0, loanEnds: stop, loanLeft, usedSoFar: Number(a.cpfUsedForHome) || 0,
    loanEffect: noLoan ? plan.incomeToday - noLoan.incomeToday : 0,
    oaShort: plan.watch.find((w) => w.key === 'oa-housing') || null,
    sale: plan.sale, saleEffect: keep ? plan.incomeToday - keep.incomeToday : 0,
    saleParts: keep ? { life: plan.payoutToday - keep.payoutToday, oa: plan.oaMonthlyToday - keep.oaMonthlyToday, other: plan.otherMonthlyToday } : null,
    shbOpen: a.status === 'SC' && a.sellHomeAge >= SHB.minAge, shbMinAge: SHB.minAge, shbMaxCommit: SHB.maxCommit,
  };
};

/* ── Chapter 7: Later life ───────────────────────────────────────────────── */
/** Health costs against MediSave, and the plan under five worse cases (stress tests). */
export const laterScene = (plan, now = new Date()) => {
  const h = healthcare(plan);
  const st = stressTests(plan.answers, now);
  const cases = st.cases.map((c) => ({ key: c.key, label: c.label, income: c.incomeToday, delta: c.delta, gap: c.gapToday }));
  const worst = cases.reduce((w, c) => (c.delta < w.delta ? c : w), cases[0]);
  return { health: h, cases, worst, income: plan.incomeToday, target: plan.target, medInflation: plan.answers.medInflation };
};

/* ── Chapter 8: Legacy ───────────────────────────────────────────────────── */
/** What would be left for family at 75 to 95: Ordinary Account savings, plus unused CPF LIFE premium. */
export const legacyScene = (plan) => {
  const d = drawdown(plan);
  const left = d.left.map((x) => ({ ...x, total: x.oa + (x.life || 0) }));
  const at85 = left.find((x) => x.age === 85) || left.at(-1) || null;
  return { ...d, left, at85, lifePlan: plan.answers.lifePlan };
};

/* ── What if panel ───────────────────────────────────────────────────────── */
/** Which chapter owns each setting, so a what-if opens where it can be tried and saved. */
export const KEY_CHAPTER = {
  realPayGrowth: 'building', stopWorkAge: 'building', topUpYearly: 'turning55', oaToSaYearly: 'turning55',
  payoutAge: 'payout', lifePlan: 'payout', oaSpreadTo: 'payout', housingMonthly: 'home', sellHomeAge: 'home', nextHomeCost: 'home',
  medInflation: 'later', ipPrivate: 'later', medUsage: 'later', oaKeep: 'legacy', parentTopUpYearly: 'family',
  eduYearly: 'family', eduStartAge: 'family', eduYears: 'family', eduRepayYears: 'family',
  lovedTransferYearly: 'family', lovedRelation: 'family', lovedFromAge: 'family', lovedYears: 'family',
};
const chapterFor = (change) => KEY_CHAPTER[Object.keys(change)[0]] || 'payout';

/**
 * The best few moves (each measured by re-running the plan with that one change) and two answers
 * worked backwards from the target: the earliest stop-work age, and the yearly top-up needed.
 */
export const whatIf = (answers, now = new Date()) => {
  const { base, moves } = findMoves(answers, now, 3);
  const best = moves.map((m) => ({ key: m.key, title: m.title, gain: m.gain, cost: m.cost, bonus: m.bonus, catch: m.catch, change: m.change, chapter: chapterFor(m.change) }));
  const target = base.target;
  const stop = target > 0 ? solveStopWork(answers, now) : null;
  const topUp = target > 0 ? solveTopUp(answers, now) : null;
  return {
    income: base.incomeToday, target, gap: base.gapToday, best,
    stopWork: stop && stop.possible ? { age: stop.age, change: { stopWorkAge: stop.age }, chapter: 'building' } : stop ? { possible: false, best: stop.best } : null,
    topUp: topUp && topUp.possible ? { amount: topUp.amount, taxSaved: topUp.taxSaved ?? taxSavedByTopUp(base, topUp.amount), change: { topUpYearly: topUp.amount }, chapter: 'turning55' } : topUp ? { possible: false } : null,
  };
};

/* ── Chapter 3: Family ───────────────────────────────────────────────────── */
/**
 * Partner: the household's income from the planner's household model (each person's own plan).
 * Parents: a cash top-up to their Special or Retirement Account leaves your own CPF unchanged; it earns
 * up to S$8,000 a year of tax relief, separate from the S$8,000 for top-ups to your own account.
 * Children's education from the Ordinary Account is not shown yet (see the engine note in Show how).
 */
export const familyScene = (plan, now = new Date()) => {
  const a = plan.answers;
  const h = buildHousehold(a, now);
  const own = Math.min(Number(a.topUpYearly) || 0, RSTU_RELIEF_CAP);
  const parentRelief = Math.min(Number(a.parentTopUpYearly) || 0, RSTU_RELIEF_CAP);
  const taxSaved = parentRelief > 0 ? taxSavedByRelief(plan, own + parentRelief) - taxSavedByRelief(plan, own) : 0;
  return {
    hasPartner: !!a.hasPartner, household: h.incomeToday, you: h.you.incomeToday, partner: h.partner ? h.partner.incomeToday : 0,
    partnerLife: h.partner ? h.partner.payoutToday : 0, partnerAge: h.partner ? h.partner.age : null, partnerPayoutAge: h.partner ? h.partner.payoutAge : null,
    yearBoth: h.yearBoth, target: h.target, gap: h.gapToday, above: h.target > 0 ? Math.max(0, h.incomeToday - h.target) : 0,
    status: h.target <= 0 ? 'no-target' : h.gapToday > 0 ? 'gap' : 'on-track',
    parentTopUp: Number(a.parentTopUpYearly) || 0, parentRelief, taxSaved,
    edu: eduSummary(plan), loved: lovedSummary(plan),
  };
};

/** Tuition paid from the Ordinary Account and repaid into it (dollars of each year), from the engine rows. */
const eduSummary = (plan) => {
  const i = plan.inputs;
  if (!(i.oaEduLoan > 0)) return null;
  const out = plan.rows.filter((r) => r.yearEduOut > 0), back = plan.rows.filter((r) => r.yearEduRepayIn > 0);
  const paid = out.reduce((t, r) => t + r.yearEduOut, 0), repaid = back.reduce((t, r) => t + r.yearEduRepayIn, 0);
  const asked = i.oaEduLoan * i.oaEduLoanDur;
  return { yearly: i.oaEduLoan, from: i.oaEduStartAge, years: i.oaEduLoanDur, paid, repaid,
    short: Math.max(0, asked - paid), repayFrom: back[0]?.age ?? null, repayTo: back.at(-1)?.age ?? null };
};

/** CPF transferred to a loved one, and how much of what was asked CPF would allow. */
const lovedSummary = (plan) => {
  const i = plan.inputs;
  if (!(i.oaToLovedOneYearly > 0)) return null;
  const sent = plan.rows.reduce((t, r) => t + (r.yearLovedOneOut || 0), 0);
  const asked = i.oaToLovedOneYearly * i.lovedOneYears;
  return { yearly: i.oaToLovedOneYearly, from: i.lovedOneFromAge, years: i.lovedOneYears, relation: i.lovedOneRelation, sent, short: Math.max(0, asked - sent) };
};
