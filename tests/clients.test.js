// Adviser client book: old files still open, new fields survive a backup, bad data is dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBook, cleanClient, cleanTags, cleanAdviser, newClient, reviewStatus, clientSummary, listClients, allTags, withLogEntry, clientPlan, MAX_LOG, DEFAULT_ACCENT } from '../src/model/clients.js';
import { buildHousehold } from '../src/model/household.js';
import { DEFAULT_ANSWERS } from '../src/model/plan.js';

const NOW = new Date(2026, 10, 16);
const done = { answers: { ...DEFAULT_ANSWERS, targetIncome: 4000 }, tried: {}, done: true, scenarios: [] };

test('a client book saved before v3.1 (no tags, review date or advice record) still opens', () => {
  const old = { v: 1, adviser: { name: 'A. Tan', firm: 'Example Advisory' }, clients: [{ id: 'c1', name: 'Mdm Lim', notes: 'n', updated: '2026-11-11T00:00:00.000Z', state: done }] };
  const b = cleanBook(JSON.parse(JSON.stringify(old)));
  assert.equal(b.clients.length, 1);
  assert.deepEqual([b.clients[0].tags, b.clients[0].reviewDate, b.clients[0].log, b.clients[0].recommendation], [[], '', [], '']);
  assert.equal(b.clients[0].state.answers.targetIncome, 4000);
  assert.deepEqual(b.adviser, { name: 'A. Tan', firm: 'Example Advisory', logo: '', accent: DEFAULT_ACCENT });
});

test('new fields survive a backup and restore', () => {
  let c = { ...newClient('c9', 'Mr Ong', '2026-11-16T01:00:00.000Z'), state: done, tags: ['couple', 'pre-retiree'], reviewDate: '2027-01-15', recommendation: 'Top up S$8,000 a year.', basis: 'Gap of S$500 a month.' };
  c = withLogEntry(c, clientPlan(c, NOW), buildHousehold(c.state.answers, NOW), 'A. Tan', '2026-11-16T02:00:00.000Z');
  const book = { adviser: { name: 'A. Tan', firm: 'F', logo: 'data:image/png;base64,AAAA', accent: '#123abc' }, clients: [c] };
  const back = cleanBook(JSON.parse(JSON.stringify({ kind: 'fusion-clients', v: 2, ...book })));
  // Restoring adds the parts a newer version keeps for every plan (Studio's chapter and moves); nothing is lost.
  assert.deepEqual(back, { ...book, clients: [{ ...c, state: { ...c.state, studio: { chapter: 'today', moves: [] } } }] });
  assert.equal(back.clients[0].log[0].recommendation, 'Top up S$8,000 a year.');
  assert.ok(back.clients[0].log[0].income > 0);
});

test('bad or hostile data is dropped, not kept', () => {
  const b = cleanBook({ adviser: { logo: 'data:image/svg+xml;base64,PHN2Zz4=', accent: 'red', name: 5 }, clients: [
    null, { name: 'no id' }, { id: 'a', name: 'A', tags: 'x, x, , y', reviewDate: 'tomorrow', log: [{ at: 1 }, { at: '2026-01-01', income: 'abc' }] }, { id: 'a', name: 'duplicate' },
  ] });
  assert.equal(b.clients.length, 1);
  assert.deepEqual(b.clients[0].tags, ['x', 'y']);
  assert.equal(b.clients[0].reviewDate, '');
  assert.deepEqual(b.clients[0].log.map((e) => e.income), [0]);
  assert.equal(b.adviser.logo, ''); assert.equal(b.adviser.accent, DEFAULT_ACCENT); assert.equal(b.adviser.name, '5');
  assert.equal(cleanAdviser({ logo: `data:image/png;base64,${'A'.repeat(300000)}` }).logo, '', 'oversized logo is refused');
  assert.equal(cleanBook('nonsense').clients.length, 0);
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 6);
  assert.equal(cleanClient({ id: 'z', state: { answers: { salary: 'lots', oa: 1234 } } }).state.answers.salary, DEFAULT_ANSWERS.salary);
});

test('review status, search, tag filter and sorting', () => {
  assert.equal(reviewStatus('', NOW), 'none');
  assert.equal(reviewStatus('2026-11-15', NOW), 'overdue');
  assert.equal(reviewStatus('2026-11-16', NOW), 'soon');
  assert.equal(reviewStatus('2026-12-16', NOW), 'soon');
  assert.equal(reviewStatus('2026-12-17', NOW), 'ok');
  const mk = (id, name, reviewDate, tags, updated) => ({ ...newClient(id, name, updated), reviewDate, tags });
  const list = [mk('1', 'Zara', '', ['couple'], '2026-01-03'), mk('2', 'Ben', '2027-02-01', ['single'], '2026-01-01'), mk('3', 'Amy', '2026-12-01', ['couple', 'hdb'], '2026-01-02')];
  assert.deepEqual(listClients(list).map((c) => c.name), ['Amy', 'Ben', 'Zara']);                 // earliest review first, none last
  assert.deepEqual(listClients(list, { sort: 'name' }).map((c) => c.name), ['Amy', 'Ben', 'Zara']);
  assert.deepEqual(listClients(list, { sort: 'updated' }).map((c) => c.name), ['Zara', 'Amy', 'Ben']);
  assert.deepEqual(listClients(list, { tag: 'couple' }).map((c) => c.name), ['Amy', 'Zara']);
  assert.deepEqual(listClients(list, { query: 'hdb' }).map((c) => c.name), ['Amy']);
  assert.deepEqual(listClients(list, { query: 'BEN' }).map((c) => c.name), ['Ben']);
  assert.deepEqual(allTags(list), ['couple', 'hdb', 'single']);
});

test('client summary matches the household model, and the advice record is capped', () => {
  let c = { ...newClient('c1', 'X', ''), state: { ...done, answers: { ...done.answers, hasPartner: true, pSalary: 4000 } } };
  const s = clientSummary(c, NOW), hh = buildHousehold(c.state.answers, NOW);
  assert.equal(s.incomeToday, hh.incomeToday); assert.equal(s.joint, true); assert.equal(s.gapToday, hh.gapToday);
  assert.equal(clientSummary(newClient('c2', 'Y', ''), NOW), null);
  for (let i = 0; i < MAX_LOG + 5; i++) c = withLogEntry(c, clientPlan(c, NOW), hh, 'A', `2026-11-16T00:00:${String(i).padStart(2, '0')}.000Z`);
  assert.equal(c.log.length, MAX_LOG);
  assert.ok(c.log[0].at > c.log[1].at, 'newest first');
});
