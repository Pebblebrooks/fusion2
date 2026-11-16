/**
 * Fusion Studio: the life story, chapter by chapter. Pure functions only, so they can be tested.
 * Every figure comes from buildPlan (src/model/plan.js), which runs the same CPF engine as the
 * planner and the classic planner. Screens never work numbers out themselves.
 */
import { DEFAULT_ANSWERS } from './plan.js';

/** Chapters in life order. `ready` = built in this release; the rest show as coming. */
export const CHAPTERS = [
  { id: 'today', title: 'Today', question: 'Where do I stand today?', ready: true },
  { id: 'building', title: 'Building', question: 'Will my savings grow enough?' },
  { id: 'family', title: 'Family', question: 'What do my children and parents cost me?' },
  { id: 'home', title: 'Home', question: 'How much CPF does my home use?' },
  { id: 'turning55', title: 'Turning 55', question: 'What happens to my CPF at 55?' },
  { id: 'payout', title: 'Payout', question: 'How much will I get each month?' },
  { id: 'later', title: 'Later life', question: 'Can I cope with health costs and shocks?' },
  { id: 'legacy', title: 'Legacy', question: 'What will I leave behind?' },
  { id: 'plan', title: 'My plan', question: 'What am I going to do?' },
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
 *   moves   — changes saved from chapters for the My plan page
 */
export const cleanStudio = (s) => ({
  chapter: CHAPTER_IDS.includes(s?.chapter) ? s.chapter : 'today',
  moves: (Array.isArray(s?.moves) ? s.moves : [])
    .filter((m) => m && typeof m.id === 'string' && typeof m.label === 'string')
    .slice(0, MAX_MOVES)
    .map((m) => ({ id: str(m.id, 40), chapter: CHAPTER_IDS.includes(m.chapter) ? m.chapter : 'today', label: str(m.label, 120), at: str(m.at, 30), change: cleanChange(m.change) })),
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
