// Compliance tests: the policy tables and engine must agree with officially published figures.
// Each block names its source. When CPF Board, IRAS or MOH publish new figures, update
// src/policy/ and these expectations together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProjectionEngine, interpolateCpfLife, raAtPayoutStart } from '../src/engine/index.js';
import { DEFAULT_INPUTS } from '../src/inputs/defaults.js';
import { ANNUAL_LIMIT, CPF_RATES, RETIREMENT_SUMS_2026, RETIREMENT_SUMS_2027, projectedSum, scAllocBand, scEmployeeRate, getPRRates, getMslPremiumForAge, SRS_CAP_SC_PR, SRS_CAP_FOREIGNER } from '../src/policy/cpf2026.js';
import { computeIrasTax, getMarginalRate } from '../src/policy/tax.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Source: CPF Board, "CPF Contribution Rate Table from 1 January 2026", Table 1; allocation rates from 1 Jan 2026.
test('2026 contribution and allocation rates (Citizens / PR 3rd year+)', () => {
  const expected = [[30, 0.37, 0.23, 0.06, 0.08], [40, 0.37, 0.21, 0.07, 0.09], [48, 0.37, 0.19, 0.08, 0.10], [53, 0.37, 0.15, 0.115, 0.105],
    [58, 0.34, 0.12, 0.115, 0.105], [63, 0.25, 0.035, 0.11, 0.105], [68, 0.165, 0.01, 0.05, 0.105], [75, 0.125, 0.01, 0.01, 0.105]];
  for (const [age, total, oa, sa, ma] of expected) {
    const b = scAllocBand(age, 2026);
    assert.ok(near(b.total, total) && near(b.oa, oa) && near(b.sa, sa) && near(b.ma, ma), `age ${age}`);
    assert.ok(near(b.oa + b.sa + b.ma, b.total, 1e-9), `age ${age} splits sum to total`);
  }
  assert.deepEqual([50, 58, 63, 68, 75].map((a) => scEmployeeRate(a, 2026)), [0.20, 0.18, 0.125, 0.075, 0.05]);
});

// Source: CPF Board, changes to senior worker contribution rates from 1 January 2027 (Budget 2026).
test('2027 senior-worker rates: +1.5 points (above 55–60) and +1 point (above 60–65), all to RA', () => {
  assert.ok(near(scAllocBand(58, 2027).total, 0.355) && near(scAllocBand(58, 2027).sa, 0.13) && near(scAllocBand(58, 2027).oa, 0.12));
  assert.ok(near(scAllocBand(63, 2027).total, 0.26) && near(scAllocBand(63, 2027).sa, 0.12) && near(scAllocBand(63, 2027).oa, 0.035));
  assert.equal(scEmployeeRate(58, 2027), 0.19);
  assert.equal(scEmployeeRate(63, 2027), 0.13);
  for (const age of [30, 40, 48, 53, 68, 75]) assert.deepEqual(scAllocBand(age, 2027), scAllocBand(age, 2026), `age ${age} unchanged`);
});

// Source: CPF Board rate tables 2–5 (first- and second-year PRs), 1 January 2026.
test('PR graduated rate totals', () => {
  const t = (yr, age, type) => getPRRates(yr, age, type).total;
  assert.deepEqual([t(1, 40, 'GG'), t(1, 58, 'GG'), t(1, 63, 'GG'), t(1, 72, 'GG')], [0.09, 0.09, 0.085, 0.085]);
  assert.deepEqual([t(2, 40, 'GG'), t(2, 58, 'GG'), t(2, 63, 'GG'), t(2, 68, 'GG')], [0.24, 0.185, 0.11, 0.085]);
  assert.deepEqual([t(1, 40, 'FG'), t(1, 58, 'FG'), t(1, 63, 'FG'), t(1, 68, 'FG'), t(1, 72, 'FG')], [0.22, 0.21, 0.175, 0.14, 0.125]);
  assert.deepEqual([t(2, 40, 'FG'), t(2, 58, 'FG'), t(2, 63, 'FG'), t(2, 68, 'FG'), t(2, 72, 'FG')], [0.32, 0.285, 0.20, 0.14, 0.125]);
});

// Sources: CPF Board retirement sums; MOF Budget 2022 Annex E-3 (BRS to 2027); MOH/CPF news release 15 Dec 2025 (BHS 2026).
test('retirement sums, Basic Healthcare Sum, limits and interest rates', () => {
  assert.deepEqual(RETIREMENT_SUMS_2026, { BRS: 110200, FRS: 220400, ERS: 440800, BHS: 79000 });
  assert.deepEqual(RETIREMENT_SUMS_2027, { BRS: 114100, FRS: 228200, ERS: 456400 });
  assert.equal(projectedSum('FRS', 0.03, 0), 220400);
  assert.equal(projectedSum('FRS', 0.03, 1), 228200);
  assert.equal(Math.round(projectedSum('FRS', 0.03, 2)), Math.round(228200 * 1.03));
  assert.equal(Math.round(projectedSum('BHS', 0.03, 1)), Math.round(79000 * 1.03));
  assert.equal(ANNUAL_LIMIT, 37740);
  assert.deepEqual([CPF_RATES.OA, CPF_RATES.SA, CPF_RATES.MA, CPF_RATES.RA], [0.025, 0.04, 0.04, 0.04]);
  assert.deepEqual([SRS_CAP_SC_PR, SRS_CAP_FOREIGNER], [15300, 35700]);
});

// Source: IRAS resident individual income tax rates, Year of Assessment 2024 onwards.
test('IRAS resident tax table', () => {
  const pts = [[20000, 0], [30000, 200], [40000, 550], [80000, 3350], [120000, 7950], [160000, 13950], [200000, 21150],
    [240000, 28750], [280000, 36550], [320000, 44550], [500000, 84150], [1000000, 199150], [1100000, 223150]];
  for (const [income, tax] of pts) assert.equal(computeIrasTax(income), tax, `chargeable income ${income}`);
  assert.deepEqual([50000, 170000, 400000, 700000, 2000000].map(getMarginalRate), [0.07, 0.18, 0.22, 0.23, 0.24]);
});

// Source: MOH / CPF Board MediShield Life premium table (before subsidies), policies renewing on or after 1 April 2025.
test('MediShield Life premiums', () => {
  const pts = [[18, 200], [25, 295], [35, 503], [45, 637], [55, 903], [63, 1131], [68, 1326], [72, 1643], [75, 1816], [77, 2027], [80, 2187], [82, 2303], [85, 2616], [88, 2785], [95, 2826]];
  for (const [age, p] of pts) assert.equal(getMslPremiumForAge(age), p, `age ${age}`);
});

// Source: CPF Board extra-interest rules (55 and above: +2% on the first $30,000, +1% on the next $30,000).
test('interest: RA of $100,000 at 55+ earns 4% plus $900 extra interest in a full year', () => {
  const rows = runProjectionEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, currentAge: 60, payoutAge: 70,
    oaBalance: 0, saBalance: 100000, maBalance: 0, salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0,
    housingOutflow: 0, medicalUsage: 0, medishieldIP: 0, elderCareShield: 0, dpsMode: 'optout' });
  assert.ok(Math.abs(rows[0].ra - 104900) <= 2, `RA after one year: ${rows[0].ra}`);
});

// Source: CPF Board estimated CPF LIFE Standard Plan payouts for members turning 55 in 2026
// (BRS → $950, FRS → $1,780, ERS → $3,440 a month from 65). The engine must land within 2%.
test('CPF LIFE: published payout estimates for the 2026 cohort are reproduced within 2%', () => {
  const noFlows = { salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0, housingOutflow: 0, medicalUsage: 0, medishieldIP: 0, elderCareShield: 0, oaBalance: 0, maBalance: 0 };
  for (const [name, ra55, published] of [['BRS', 110200, 950], ['FRS', 220400, 1780], ['ERS', 440800, 3440]]) {
    // A member on their 55th birthday (birth month = profile month) with the sum set aside in the RA.
    const rows = runProjectionEngine({ ...DEFAULT_INPUTS, ...noFlows, currentYear: 2026, currentMonth: 11, birthMonth: 11, currentAge: 55, payoutAge: 65, saBalance: ra55 });
    const payout = interpolateCpfLife(raAtPayoutStart(rows.find((r) => r.age === 65)), 'std', true, 65);
    assert.ok(Math.abs(payout / published - 1) <= 0.02, `${name}: engine $${Math.round(payout)} vs published $${published}`);
  }
});

test('payout uses the RA on the payout birthday, not a year later', () => {
  const rows = runProjectionEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 11, currentAge: 40, payoutAge: 65 });
  const r65 = rows.find((r) => r.age === 65), r64 = rows.find((r) => r.age === 64);
  assert.equal(raAtPayoutStart(r65), r65.raStart);
  assert.ok(Math.abs(r65.raStart - r64.ra) <= 1, 'opening balance of the age-65 year equals the closing balance of the age-64 year');
  assert.ok(r65.ra > r65.raStart);
});

// Source: CPF Board — the Full Retirement Sum caps top-ups and transfers to the SA, not mandatory contributions.
test('below 55, wage contributions keep going to the SA after it passes the Full Retirement Sum', () => {
  const rows = runProjectionEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, currentAge: 40, saBalance: 230000,
    oaBalance: 50000, maBalance: 79000, salaryGross: 8000, salaryBonus: 0, empOaCont: 20160, empSaCont: 6720, empMaCont: 8640, housingOutflow: 0 });
  // 230,000 + 4% interest (about 9,300) + 6,720 mandatory + MediSave overflow is redirected, so SA must exceed 245,000.
  assert.ok(rows[0].sa > 245000, `SA after one year: ${rows[0].sa}`);
});
