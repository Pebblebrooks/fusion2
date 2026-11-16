/**
 * Adviser client book: pure data handling (no React, no browser storage), so it can be tested.
 *
 * book   = { adviser: { name, firm, logo, accent }, clients: [client] }
 * client = { id, name, notes, updated, state, tags[], reviewDate, recommendation, basis, log[] }
 *   state — the same shape as a personal plan: { answers, tried, done, scenarios, studio }
 *   log   — advice record: one entry each time a report is issued (newest first, capped)
 * Everything read from storage or a backup file passes through cleanBook, so old files
 * (before tags, review dates and the advice record existed) still open.
 */
import { DEFAULT_ANSWERS, buildPlan } from './plan.js';
import { buildHousehold } from './household.js';
import { cleanStudio } from './studio.js';
import { RULES_VERSION } from '../policy/cpf2026.js';

export const MAX_LOG = 50, MAX_TAGS = 6, MAX_LOGO_CHARS = 280000; // about 200 KB of image as a data URL
export const DEFAULT_ACCENT = '#0F766E';
const str = (v, max) => String(v ?? '').slice(0, max);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A plan state with unknown or badly typed fields dropped. */
export const cleanState = (state) => {
  const answers = { ...DEFAULT_ANSWERS };
  for (const k of Object.keys(DEFAULT_ANSWERS)) if (state?.answers && typeof state.answers[k] === typeof DEFAULT_ANSWERS[k]) answers[k] = state.answers[k];
  return {
    answers, done: !!state?.done,
    tried: state?.tried && typeof state.tried === 'object' ? state.tried : {},
    scenarios: Array.isArray(state?.scenarios) ? state.scenarios.filter((s) => s && typeof s.name === 'string' && s.tried && typeof s.tried === 'object').slice(0, 4) : [],
    studio: cleanStudio(state?.studio), // Fusion Studio's chapter and saved moves (plan version 2)
  };
};

export const cleanTags = (tags) => [...new Set((Array.isArray(tags) ? tags : String(tags ?? '').split(','))
  .map((t) => str(t, 24).trim()).filter(Boolean))].slice(0, MAX_TAGS);

const cleanLog = (log) => (Array.isArray(log) ? log : []).filter((e) => e && typeof e.at === 'string').slice(0, MAX_LOG).map((e) => ({
  at: str(e.at, 30), income: Number(e.income) || 0, life: Number(e.life) || 0, target: Number(e.target) || 0, score: Number(e.score) || 0,
  recommendation: str(e.recommendation, 2000), basis: str(e.basis, 2000), by: str(e.by, 100),
  rules: str(e.rules, 20), // rules version the figures were worked out under ('' = before versioning)
}));

export const cleanClient = (c) => ({
  id: c.id, name: str(c.name || 'Client', 40), notes: str(c.notes, 2000), updated: str(c.updated, 30), state: cleanState(c.state),
  tags: cleanTags(c.tags), reviewDate: isDate(c.reviewDate) ? c.reviewDate : '',
  recommendation: str(c.recommendation, 2000), basis: str(c.basis, 2000), log: cleanLog(c.log),
});

export const EMPTY_BOOK = { adviser: { name: '', firm: '', logo: '', accent: DEFAULT_ACCENT }, clients: [] };

export const cleanAdviser = (a) => ({
  name: str(a?.name, 60), firm: str(a?.firm, 100),
  // Only raster images are kept as a logo, and only if small enough to leave room for client files.
  logo: typeof a?.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(a.logo) && a.logo.length <= MAX_LOGO_CHARS ? a.logo : '',
  accent: typeof a?.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.accent) ? a.accent : DEFAULT_ACCENT,
});

export const cleanBook = (raw) => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.clients)) return { ...EMPTY_BOOK, adviser: { ...EMPTY_BOOK.adviser } };
  const seen = new Set();
  return {
    adviser: cleanAdviser(raw.adviser),
    clients: raw.clients.filter((c) => c && typeof c.id === 'string' && !seen.has(c.id) && seen.add(c.id)).map(cleanClient),
  };
};

export const newClient = (id, name, nowIso) => cleanClient({ id, name, updated: nowIso });

/** Review date against today: 'none' | 'overdue' | 'soon' (within 30 days) | 'ok'. */
export const reviewStatus = (reviewDate, now = new Date()) => {
  if (!isDate(reviewDate)) return 'none';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (reviewDate < today) return 'overdue';
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const limit = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
  return reviewDate <= limit ? 'soon' : 'ok';
};

/** Headline figures for one client's row in the list. Null until setup is finished. */
export const clientSummary = (client, now = new Date()) => {
  if (!client.state.done) return null;
  const a = { ...client.state.answers, ...client.state.tried };
  const hh = buildHousehold(a, now);
  return { incomeToday: hh.incomeToday, lifeToday: hh.lifeToday, target: hh.target, gapToday: hh.gapToday, joint: !!hh.partner, score: hh.you.score, label: hh.you.label, age: hh.you.age };
};

export const allTags = (clients) => [...new Set(clients.flatMap((c) => c.tags))].sort((x, y) => x.localeCompare(y));

/** Search by name or tag, filter by tag, then sort. sort: 'review' | 'name' | 'updated'. */
export const listClients = (clients, { query = '', tag = '', sort = 'review' } = {}) => {
  const q = query.trim().toLowerCase();
  const out = clients.filter((c) => (!tag || c.tags.includes(tag)) && (!q || c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))));
  const by = {
    name: (x, y) => x.name.localeCompare(y.name),
    updated: (x, y) => y.updated.localeCompare(x.updated),
    // Earliest review first; clients with no review date go last.
    review: (x, y) => (x.reviewDate || '9999').localeCompare(y.reviewDate || '9999') || x.name.localeCompare(y.name),
  };
  return out.sort(by[sort] || by.review);
};

/** Advice record: add an entry for a report issued now. Returns the client with the entry first in its log. */
export const withLogEntry = (client, plan, hh, adviserName, nowIso) => ({
  ...client,
  log: [{ at: nowIso, income: hh.incomeToday, life: hh.lifeToday, target: hh.target, score: plan.score,
    recommendation: client.recommendation, basis: client.basis, by: str(adviserName, 100), rules: RULES_VERSION }, ...client.log].slice(0, MAX_LOG),
});

/** A client's plan as the engine sees it now (what-ifs included). */
export const clientPlan = (client, now = new Date()) => buildPlan({ ...client.state.answers, ...client.state.tried }, now);

/**
 * Review all clients: each finished plan re-run under the current rules, set against the figures in
 * the client's last issued report. flag: 'crossed' (went above or below target), 'moved' (income
 * changed by more than 5%), 'rules' (last report used older rules), 'none' (no report yet), or ''.
 */
export const reviewAll = (clients, now = new Date()) => clients.filter((c) => c.state.done).map((c) => {
  const s = clientSummary(c, now), last = c.log[0] || null;
  const change = last ? s.incomeToday - last.income : null;
  const pctChange = last && last.income > 0 ? change / last.income : null;
  const metNow = s.target > 0 ? s.gapToday === 0 : null, metThen = last && last.target > 0 ? last.income >= last.target : null;
  const flag = !last ? 'none' : metNow !== null && metThen !== null && metNow !== metThen ? 'crossed'
    : pctChange !== null && Math.abs(pctChange) > 0.05 ? 'moved' : last.rules !== RULES_VERSION ? 'rules' : '';
  return { id: c.id, name: c.name, incomeToday: s.incomeToday, target: s.target, gapToday: s.gapToday, label: s.label,
    lastAt: last ? last.at : '', lastIncome: last ? last.income : null, lastRules: last ? last.rules : '', change, pctChange, flag };
}).sort((x, y) => ['crossed', 'moved', 'rules', 'none', ''].indexOf(x.flag) - ['crossed', 'moved', 'rules', 'none', ''].indexOf(y.flag) || x.name.localeCompare(y.name));

export const reviewCsv = (rows) => ['Client,Monthly income now,Target,Gap,Last report,Income in last report,Change,Change %,Rules in last report,Flag',
  ...rows.map((r) => [`"${r.name.replace(/"/g, '""')}"`, r.incomeToday, r.target, r.gapToday, r.lastAt.slice(0, 10), r.lastIncome ?? '', r.change ?? '',
    r.pctChange === null ? '' : (r.pctChange * 100).toFixed(1), r.lastRules, r.flag].join(','))].join('\n');
export { RULES_VERSION };
