// CPF and HDB scheme rules added 18 Nov 2026 (CPF compliance register, corrections 22–27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lbsOutcome, lbsRequirement, propertyTowardsFrs, frsSetAside, makeCpfis, cpfisInvest, cpfisGrow, cpfisSell, oaWithdrawal, oaToRaAtPayout } from '../src/engine/schemes.js';
import { runProjectionEngine, runRSSEngine } from '../src/engine/index.js';
import { DEFAULT_INPUTS } from '../src/inputs/defaults.js';
import { RETIREMENT_SUMS_2026 as S } from '../src/policy/cpf2026.js';

const sums = { frs: S.FRS, brs: S.BRS };
const run = (p) => runProjectionEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 11, ...p });
const at = (rows, age) => rows.find((r) => r.age === age);

test('22 Lease Buyback Scheme: HDB 2026 requirement table, top-up order, cash cap and bonus', () => {
  // HDB T&C (Dec 2025), applications in 2026
  assert.deepEqual([65, 70, 80].map((age) => lbsRequirement({ age, owners: 1, ...sums })), [220400, 210400, 200400]);
  assert.deepEqual([65, 70, 80].map((age) => lbsRequirement({ age, owners: 2, ...sums })), [110200, 105200, 100200]);
  // Sole owner, RA S$150,000, S$100,000 of proceeds: S$70,400 tops up to the FRS, S$29,600 cash, full 4-room bonus
  const a = lbsOutcome({ age: 66, proceeds: 100000, ra: 150000, owners: 1, flat: '4r', ...sums });
  assert.deepEqual([a.topUp, a.cash, a.bonus], [70400, 29600, 15000]);
  // Small top-up: pro-rated bonus, S$1 for every S$2 (3-room)
  const b = lbsOutcome({ age: 66, proceeds: 30000, ra: 200000, owners: 1, flat: '3r', ...sums });
  assert.deepEqual([b.topUp, b.cash, b.bonus], [20400, 9600, 10200]);
  // Two owners, member already at the BRS: no top-up needed, and no bonus
  const c = lbsOutcome({ age: 66, proceeds: 40000, ra: 120000, owners: 2, flat: '4r', ...sums });
  assert.deepEqual([c.topUp, c.cash, c.bonus], [0, 40000, 0]);
  // Cash above S$100,000 a household tops up to the FRS: sole owner at the FRS requirement... share 300,000, RA 0
  const d = lbsOutcome({ age: 66, proceeds: 300000, ra: 0, owners: 1, flat: '5r', ...sums });
  assert.equal(d.topUp, S.FRS); assert.equal(d.cash, 300000 - S.FRS); assert.equal(d.bonus, 7500);
  // Two owners each S$200,000, RA 0: BRS first; household cash would be 2 × 89,800 > 100,000, so the excess goes to the FRS
  const e = lbsOutcome({ age: 66, proceeds: 200000, ra: 0, owners: 2, flat: '4r', ...sums });
  assert.equal(e.cash, 50000); assert.equal(e.topUp, 150000); assert.equal(e.bonus, 7500); // household bonus S$15,000 shared
  // In the engine: RA top-up, cash and bonus to private assets; no monthly HDB income
  const rows = run({ currentAge: 60, birthYear: 1966, oaBalance: 20000, saBalance: 100000, maBalance: 50000, salaryGross: 0, contributionStopAge: 60,
    propertyValue: 400000, includeProperty: true, propMonetiseEnabled: true, propMonetiseScheme: 'lbs', propMonetiseAge: 66, lbsProceeds: 80000, lbsFlat: '3r' });
  const r = at(rows, 66);
  assert.ok(r.lbsTopUp > 0 && r.lbsBonus > 0);
  assert.equal(r.lbsTopUp + r.lbsCash, 80000);
  assert.ok(at(rows, 67).privateAssets - at(rows, 65).privateAssets < r.lbsCash + r.lbsBonus + 5000, 'no monthly HDB income');
  // Below 65: nothing happens
  const early = run({ currentAge: 60, birthYear: 1966, propertyValue: 400000, propMonetiseEnabled: true, propMonetiseScheme: 'lbs', propMonetiseAge: 64, lbsProceeds: 80000 });
  assert.equal(at(early, 64).lbsTopUp, 0);
});

test('23 MRSS and MMSS need the property conditions', () => {
  const p = { currentAge: 58, birthYear: 1968, oaBalance: 5000, saBalance: 60000, maBalance: 20000, salaryGross: 2500, empOaCont: 0, empSaCont: 0, empMaCont: 0, vcSaTopup: 2000, vcMaCash: 1000 };
  const yes = run(p), no = run({ ...p, matchedPropertyOk: false });
  assert.ok(at(yes, 58).yearGovGrants > 0, 'grant when conditions met');
  assert.ok(yes.reduce((t, r) => t + r.yearGovGrants, 0) > no.reduce((t, r) => t + r.yearGovGrants, 0));
  assert.equal(at(no, 58).yearGovGrants, 0);
});

test('24 CPFIS: kept invested by default, returns can be negative, sale routing at and after 55', () => {
  const pot = makeCpfis({ oaHeld: 10000, saHeld: 5000 });
  cpfisGrow(pot, { rate: -0.1 });
  assert.equal(Math.round(pot.oa + pot.sa), 13500);
  cpfisGrow(pot, { rate: 0.05, fall: 0.3 });
  assert.equal(Math.round(pot.oa), Math.round(9000 * 1.05 * 0.7));
  cpfisInvest(pot, { fromOa: 1000 });
  // From 55: SA proceeds to the RA up to the FRS, the rest to the OA
  const sold = cpfisSell({ oa: 50000, sa: 30000 }, { age: 60, ra: S.FRS - 10000, frs: S.FRS });
  assert.deepEqual([sold.toOa, sold.toRa, sold.toSa], [70000, 10000, 0]);
  assert.deepEqual(cpfisSell({ oa: 1, sa: 2 }, { age: 40, ra: 0, frs: S.FRS }).toSa, 2);
  // Engine: no sale age → CPF balances as before, investments shown; sale at 60 returns the money
  const base = { currentAge: 45, birthYear: 1981, oaBalance: 120000, saBalance: 80000, cpfisOaHeld: 30000, cpfisReturn: 5 };
  const kept = run(base), plain = run({ ...base, cpfisOaHeld: 0 });
  assert.equal(at(kept, 70).oa, at(plain, 70).oa);
  assert.ok(at(kept, 70).cpfisValue > 30000);
  const sell = run({ ...base, cpfisSellAge: 60 });
  assert.ok(at(sell, 60).yearCpfisIn > 30000 * 1.6);
  assert.ok(at(sell, 60).oa > at(plain, 60).oa);
  const crash = run({ ...base, cpfisSellAge: 60, cpfisFallPct: 30 });
  assert.equal(Math.round(at(crash, 60).yearCpfisIn / at(sell, 60).yearCpfisIn * 100), 70);
  // Not counted at 55: the RA is formed from cash only
  assert.equal(at(kept, 55).ra, at(plain, 55).ra);
});

test('24b OA → MediSave transfer only once the FRS is set aside', () => {
  const p = { currentAge: 60, birthYear: 1966, oaBalance: 150000, saBalance: 150000, maBalance: 30000, salaryGross: 0, contributionStopAge: 60, oaToMaTransfer: 5000 };
  const below = run(p);
  assert.equal(at(below, 61).ma <= at(run({ ...p, oaToMaTransfer: 0 }), 61).ma + 1, true, 'below the FRS: no transfer');
  const above = run({ ...p, saBalance: S.FRS + 10000 });
  assert.ok(at(above, 61).ma > at(run({ ...p, saBalance: S.FRS + 10000, oaToMaTransfer: 0 }), 61).ma + 4000);
  assert.equal(frsSetAside({ cash: S.BRS, property: S.FRS - S.BRS, ...sums }), true);
  assert.equal(frsSetAside({ cash: S.BRS - 1, property: S.FRS, ...sums }), false);
});

test('25 Ordinary Account from 55: moved to the RA on withdrawal and at payout start', () => {
  // Withdrawal below the FRS: non-withdrawable OA moves to the RA; only the S$5,000 can be taken
  const w = oaWithdrawal({ want: 20000, oa: 50000, need: 30000, free5k: 5000 });
  assert.deepEqual([w.toRa, w.out, w.free5kLeft], [30000, 20000, 5000]); // the move meets the sum, so the rest is free
  const w2 = oaWithdrawal({ want: 20000, oa: 50000, need: 80000, free5k: 5000 });
  assert.deepEqual([w2.toRa, w2.out, w2.free5kLeft], [45000, 5000, 0]);
  assert.equal(oaWithdrawal({ want: 1000, oa: 10000, need: 0 }).out, 1000);
  assert.equal(oaToRaAtPayout({ oa: 40000, need: 25000, free5k: 5000 }), 25000);
  assert.equal(oaToRaAtPayout({ oa: 4000, need: 25000, free5k: 5000 }), 0);
  // Engine: member born 1966 below the FRS at 65 → OA moves to the RA before payouts are worked out
  const p = { currentAge: 60, birthYear: 1966, oaBalance: 60000, saBalance: 120000, maBalance: 40000, salaryGross: 0, contributionStopAge: 60, payoutAge: 65 };
  const on = run(p), off = run({ ...p, oaToRaAtPayout: false });
  assert.ok(at(on, 65).yearOaToRa > 0);
  assert.ok(at(on, 65).raStart > at(off, 65).raStart);
  assert.ok(at(on, 65).oa < at(off, 65).oa);
  // Born before 1958 (Retirement Sum Scheme engine): no payout-start transfer
  assert.equal(runRSSEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentAge: 70, birthYear: 1956, cpfScheme: 'rss', oaBalance: 50000, saBalance: 60000 }).some((r) => r.yearOaToRa > 0), false);
});

test('T property towards the FRS: CPF used plus interest, or a pledge, only with lease to 95', () => {
  const base = { owns: true, age: 50, ...sums };
  assert.equal(propertyTowardsFrs({ ...base, cpfUsedWithInterest: 50000 }), 50000);
  assert.equal(propertyTowardsFrs({ ...base, cpfUsedWithInterest: 500000 }), S.FRS - S.BRS);
  assert.equal(propertyTowardsFrs({ ...base, pledged: true }), S.FRS - S.BRS);
  assert.equal(propertyTowardsFrs({ ...base, cpfUsedWithInterest: 50000, leaseLeft: 40 }), 0); // lasts to 90 only
  assert.equal(propertyTowardsFrs({ ...base, owns: false, cpfUsedWithInterest: 50000 }), 0);
});
