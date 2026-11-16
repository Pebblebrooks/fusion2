// Corrections P, Q and S (17 Nov 2026): CPF Education Loan Scheme repayment and timing, and the
// retirement sum a member keeps back before transferring CPF savings to loved ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eduWithdrawsAt, eduRepayStartAge, makeEduLoan, eduLoanYear, lovedOneTransfer } from '../src/engine/family.js';
import { runProjectionEngine, runRSSEngine } from '../src/engine/index.js';
import { DEFAULT_INPUTS } from '../src/inputs/defaults.js';
import { GOLDEN_CLOCK } from './golden/profiles.js';
import { RETIREMENT_SUMS_2026 as S } from '../src/policy/cpf2026.js';

const base = { ...DEFAULT_INPUTS, ...GOLDEN_CLOCK, currentAge: 35, birthYear: 1991, oaBalance: 120000, saBalance: 60000, maBalance: 40000,
  housingOutflow: 0, includeProperty: false, propertyValue: 0, salaryGross: 6000, salaryBonus: 6000 };
const run = (over) => runProjectionEngine({ ...base, ...over });
const at = (rows, age) => rows.find((r) => r.age === age);

test('P/Q: tuition is paid from a chosen start age, then repaid into the OA one year after the course', () => {
  const opts = { startAge: 35, from: 45, freq: 'annual', dur: 4 };
  assert.deepEqual([44, 45, 48, 49].map((a) => eduWithdrawsAt(a, opts)), [false, true, true, false]);
  assert.equal(eduRepayStartAge(opts), 50); // course ends after age 48; repayments one year later
  // Older settings keep their meaning: start 0 = first projection year; one-time = one year
  assert.equal(eduWithdrawsAt(35, { startAge: 35, from: 0, freq: 'one-time', dur: 0 }), true);
  assert.equal(eduWithdrawsAt(36, { startAge: 35, from: 0, freq: 'one-time', dur: 0 }), false);
  assert.equal(eduRepayStartAge({ startAge: 35, from: 0, freq: 'annual', dur: 0 }), null); // no end set: no repayment
});

test('P: repayments clear the amount withdrawn plus the OA interest it would have earned, in 12 years', () => {
  const loan = makeEduLoan();
  let repaid = 0, years = 0;
  for (let age = 45; age < 70; age++) {
    const r = eduLoanYear(loan, { age, repayFrom: 50, years: 12, withdrawn: age >= 45 && age < 49 ? 10000 : 0 });
    if (r > 0) { repaid += r; years++; }
  }
  assert.equal(years, 12);
  assert.ok(loan.owed < 1, 'fully repaid');
  // Value check: each withdrawal grown at 2.5% to the first repayment, then the 12 instalments discounted back
  const owedAt50 = [45, 46, 47, 48].reduce((t, a) => t + 10000 * Math.pow(1.025, 50 - a), 0);
  const inst = (owedAt50 * 0.025) / (1.025 * (1 - Math.pow(1.025, -12)));
  assert.ok(Math.abs(repaid - inst * 12) < 2, `${repaid} vs ${inst * 12}`);
});

test('P/Q in the engine: no withdrawal before the start age; the OA is made whole by the repayments', () => {
  const none = run({});
  const edu = run({ oaEduLoan: 10000, oaEduLoanFreq: 'annual', oaEduLoanDur: 4, oaEduStartAge: 45 });
  assert.equal(at(edu, 44).yearEduOut, 0);
  assert.equal(at(edu, 45).yearEduOut, 10000);
  assert.equal(edu.filter((r) => r.yearEduOut > 0).length, 4);
  assert.equal(at(edu, 49).yearEduRepayIn, 0);
  assert.ok(at(edu, 50).yearEduRepayIn > 0);
  assert.equal(edu.filter((r) => r.yearEduRepayIn > 0).length, 12);
  // Before the fix the OA stayed S$40,000-plus short for good; now it is back to within 1% by 65
  const gap = at(none, 64).oa - at(edu, 64).oa;
  assert.ok(Math.abs(gap) / at(none, 64).oa < 0.01, `OA gap at 65: ${gap}`);
  // Money in includes the repayments, so balances still add up
  const r50 = at(edu, 50);
  assert.ok(r50.injected >= r50.yearMandatory + r50.yearEduRepayIn - 1);
});

test('P/Q: the second engine (Retirement Sum Scheme members) follows the same rules', () => {
  const rows = runRSSEngine({ ...base, oaEduLoan: 10000, oaEduLoanFreq: 'annual', oaEduLoanDur: 2, oaEduStartAge: 40 });
  assert.equal(at(rows, 39).yearEduOut, 0);
  assert.equal(at(rows, 40).yearEduOut, 10000);
  assert.ok(at(rows, 43).yearEduRepayIn > 0);
});

test('S: transfers to loved ones only from savings above the retirement sum kept back', () => {
  const sums = { brs: S.BRS, frs: S.FRS };
  // Below the FRS: nothing can go to a parent
  assert.equal(lovedOneTransfer({ amount: 10000, age: 40, oa: 100000, sa: 50000, ...sums }).total, 0);
  // Above it: up to the excess
  assert.equal(lovedOneTransfer({ amount: 10000, age: 40, oa: 250000, sa: 30000, ...sums }).total, 10000);
  assert.equal(lovedOneTransfer({ amount: 100000, age: 40, oa: 250000, sa: 30000, ...sums }).total, 280000 - S.FRS);
  assert.equal(lovedOneTransfer({ amount: 100000, age: 40, oa: 20000, sa: 230000, ...sums }).total, 20000); // only OA can go before 55
  // Spouse: only the BRS is kept back
  assert.equal(lovedOneTransfer({ amount: 50000, age: 40, oa: 100000, sa: 50000, relation: 'spouse', ...sums }).total, 150000 - S.BRS);
  // Parent, with a property that covers the rest of the FRS: BRS kept back
  assert.equal(lovedOneTransfer({ amount: 50000, age: 40, oa: 100000, sa: 50000, ownsProperty: true, propertyValue: 500000, ...sums }).total, 150000 - S.BRS);
  // Siblings and in-laws: FRS kept back, property does not help
  assert.equal(lovedOneTransfer({ amount: 50000, age: 40, oa: 100000, sa: 50000, relation: 'other', ownsProperty: true, propertyValue: 500000, ...sums }).total, 0);
  // From 55: OA first, then RA
  const t = lovedOneTransfer({ amount: 30000, age: 60, oa: 10000, ra: 250000, ...sums });
  assert.deepEqual([t.fromOa, t.fromRa, t.total], [10000, 20000, 30000]);
});

test('S in the engine: the old loved-one switch is capped, and a separate transfer runs alongside your own', () => {
  // Old switch: S$50,000 a year to a parent with S$180,000 in OA+SA (below the FRS): nothing allowed
  const capped = run({ oaToSaTransfer: 50000, oaToSaForLovedOne: true, oaBalance: 120000, saBalance: 60000 });
  assert.equal(at(capped, 35).yearLovedOneOut, 0);
  // Separate transfer for 3 years from 36, with the member's own OA→SA transfer still running
  const rich = { oaBalance: 300000, saBalance: 100000 };
  const both = run({ ...rich, oaToSaTransfer: 5000, oaToLovedOneYearly: 8000, lovedOneFromAge: 36, lovedOneYears: 3 });
  assert.equal(at(both, 35).yearLovedOneOut, 0);
  assert.deepEqual([36, 37, 38, 39].map((a) => at(both, a).yearLovedOneOut), [8000, 8000, 8000, 0]);
  const own = run({ ...rich, oaToSaTransfer: 5000 });
  assert.ok(Math.abs(at(both, 36).sa - at(own, 36).sa) < 1, 'own transfer unchanged');
});
