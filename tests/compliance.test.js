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

// Source: HDB — Silver Housing Bonus (rules from 1 Dec 2025).
test('Silver Housing Bonus is a cash bonus worked out from the amount committed to the RA', async () => {
  const { silverHousingBonus, SHB } = await import('../src/policy/cpf2026.js');
  assert.equal(silverHousingBonus({ committed: 60000 }), 30000);
  assert.equal(silverHousingBonus({ committed: 40000 }), 20000);           // $1 for every $2
  assert.equal(silverHousingBonus({ committed: 90000 }), 30000);           // only $60,000 counts
  assert.equal(silverHousingBonus({ committed: 60000, nextFlat: '2r' }), 40000);
  assert.equal(silverHousingBonus({ committed: 30000, nextFlat: '2r' }), 25000);
  assert.equal(silverHousingBonus({ committed: 60000, higherAv: true }), 10000); // $1 for every $6
  assert.equal(silverHousingBonus({ committed: 60000, higherAv: true, nextFlat: '2r' }), 20000);
  assert.equal(SHB.minAge, 55);

  const base = { ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, currentAge: 60, saBalance: 100000, oaBalance: 0, maBalance: 50000,
    salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0, housingOutflow: 0, currentPrivateAssets: 0, annualPrivateSaving: 0,
    propMonetiseEnabled: true, propMonetiseAge: 62, propMonetiseCashProceeds: 100000, propMonetiseRaTopup: 60000 };
  const at = (rows) => rows.find((r) => r.age === 62);
  const plain = at(runProjectionEngine({ ...base, propMonetiseScheme: 'downgrade' }));
  const shb = at(runProjectionEngine({ ...base, propMonetiseScheme: 'shb', shsToFlat: '3r' }));
  assert.equal(Math.round(shb.ra), Math.round(plain.ra), 'the bonus is not credited to the Retirement Account');
  assert.equal(Math.round(shb.propertyValue), Math.round(plain.propertyValue), 'the bonus does not come out of the property');
  const extra = shb.privateAssets - plain.privateAssets;
  assert.ok(extra >= 30000 && extra < 33000, `cash bonus added to private assets: ${extra}`);
});

// Source: CPF Board — "Selling your home: before vs after age 55"; housing refund FAQs.
test('selling a home refunds CPF used plus 2.5% accrued interest; from 55 it first fills the RA to the Full Retirement Sum', () => {
  const base = { ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, dpsMode: 'optout', saBalance: 0, maBalance: 0,
    salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0, housingOutflow: 0, medicalUsage: 0, annualGovGrant: 0,
    propertyValue: 600000, includeProperty: true, housingCpfUsedToDate: 100000 };
  // Below 55: refund goes to the Ordinary Account. 100,000 after two more years at 2.5% = 105,063.
  const young = runProjectionEngine({ ...base, currentAge: 40, oaBalance: 0, sellPropertyAge: 42 });
  const before = young.find((r) => r.age === 41), after = young.find((r) => r.age === 42);
  assert.ok(after.oa - before.oa > 105000 && after.oa - before.oa < 110000, `OA rose by ${after.oa - before.oa}`);
  assert.equal(after.ra, 0);
  // From 55: an empty RA is filled first, up to the member's own FRS (turned 55 in 2021: 186,000).
  const old = runProjectionEngine({ ...base, currentAge: 60, oaBalance: 0, housingCpfUsedToDate: 300000, sellPropertyAge: 61 });
  const o = old.find((r) => r.age === 61);
  assert.ok(o.ra >= 186000 && o.ra < 200000, `RA after sale: ${o.ra}`);
  assert.ok(o.oa > 110000, `balance stays in OA: ${o.oa}`);
  // Nothing sold, nothing refunded.
  assert.equal(runProjectionEngine({ ...base, currentAge: 40, oaBalance: 0 }).find((r) => r.age === 42).oa, 0);
});

// Source: CPF Board — Retirement Sum Topping-Up Scheme: top-ups are accepted up to the current
// Full Retirement Sum below 55 and up to the current Enhanced Retirement Sum from 55.
test('a cash top-up above the limit is not accepted and does not spill into the Ordinary Account', () => {
  const base = { ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, dpsMode: 'optout', maBalance: 0, medicalUsage: 0,
    salaryGross: 5000, salaryBonus: 0, empOaCont: 13800, empSaCont: 3600, empMaCont: 4800, housingOutflow: 0, annualGovGrant: 0 };
  // Below 55 with the SA already above the FRS (220,400 in 2026): the whole top-up is turned away.
  const full = { ...base, currentAge: 40, oaBalance: 10000, saBalance: 230000 };
  const a = runProjectionEngine({ ...full, vcSaTopup: 8000 })[0], b = runProjectionEngine(full)[0];
  assert.equal(a.oa, b.oa); assert.equal(a.sa, b.sa);
  assert.equal(a.topUpNotAccepted, 8000);
  // With room, it is accepted in full.
  const room = { ...base, currentAge: 40, oaBalance: 10000, saBalance: 50000 };
  const c = runProjectionEngine({ ...room, vcSaTopup: 8000 })[0], d = runProjectionEngine(room)[0];
  assert.ok(c.sa - d.sa >= 8000 && c.sa - d.sa < 8400, `SA rose by ${c.sa - d.sa}`);
  assert.equal(c.oa, d.oa); assert.equal(c.topUpNotAccepted, undefined);
  // From 55 the limit is the Enhanced Retirement Sum (440,800 in 2026), not the Full Retirement Sum.
  const senior = { ...base, currentAge: 58, oaBalance: 0, saBalance: 300000 };
  const e = runProjectionEngine({ ...senior, vcSaTopup: 8000 })[0], f = runProjectionEngine(senior)[0];
  assert.ok(e.ra - f.ra >= 8000, `RA rose by ${e.ra - f.ra}`);
  assert.equal(e.oa, f.oa);
});

// ── Healthcare premiums and MediSave limits ─────────────────────────────────
// Sources: MOH "About Integrated Shield Plans" (Additional Withdrawal Limits); CPF Board CareShield Life
// welcome booklets 2026 and careshieldlife.gov.sg (payment period, catch-up component).
test('Integrated Shield: MediSave pays the private part only up to the limit for the age', async () => {
  const { ipWithdrawalLimit, medicalYear } = await import('../src/engine/medical.js');
  assert.deepEqual([30, 40, 41, 70, 71, 90].map(ipWithdrawalLimit), [300, 300, 600, 600, 900, 900]); // age next birthday
  const base = { medicalUsage: 0, elderCareShield: 0, medicalInflationRate: 0, medishieldMode: 'auto', ipPrivatePremium: 2000 };
  const y = medicalYear(base, 44, 0, 50000); // next birthday 45: MediShield Life $637, limit $600
  assert.equal(y.msl, 637); assert.equal(y.ipFromMa, 600); assert.equal(y.ipCash, 1400);
  assert.equal(y.fromMa, 1237); assert.equal(y.cash, 1400);
  // Manual mode: the member's own combined premium is split the same way.
  const m = medicalYear({ ...base, medishieldMode: 'manual', medishieldIP: 2637, ipPrivatePremium: 0 }, 44, 0, 50000);
  assert.deepEqual([m.msl, m.ipFromMa, m.ipCash], [637, 600, 1400]);
  // MediShield Life itself has no limit, and what MediSave cannot cover becomes cash.
  const poor = medicalYear({ ...base, ipPrivatePremium: 0 }, 84, 0, 1000); // next birthday 85: $2,616
  assert.equal(poor.fromMa, 1000); assert.equal(poor.cash, 1616);
});

test('CareShield Life: premiums run to 67, or for 10 years after joining if later; catch-up is flat for 10 years', async () => {
  const { careShieldAges, medicalYear } = await import('../src/engine/medical.js');
  assert.deepEqual(careShieldAges(0), { from: 30, to: 67 });
  assert.deepEqual(careShieldAges(45), { from: 45, to: 67 });
  assert.deepEqual(careShieldAges(58), { from: 58, to: 67 });   // 10 payments, the last at 67
  assert.deepEqual(careShieldAges(59), { from: 59, to: 68 });   // MOH: 10 years for those joining at 59 or older
  assert.deepEqual(careShieldAges(65), { from: 65, to: 74 });
  const inp = { medicalUsage: 0, medishieldMode: 'manual', medishieldIP: 0, elderCareShield: 800, careShieldJoinAge: 62, careShieldCatchUp: 300, medicalInflationRate: 5 };
  const at = (age) => medicalYear(inp, age, age - 62, 1e6).careShield;
  assert.equal(at(61), 0);
  assert.equal(at(62), 1100);                                   // base 800 + catch-up 300
  assert.equal(at(67), Math.round(800 * Math.pow(1.05, 5)) + 300);
  assert.equal(at(71), Math.round(800 * Math.pow(1.05, 5)) + 300); // base flat after 67; last catch-up year
  assert.equal(at(72), 0);                                      // 10 years done
  // Born 1980 or later: nothing before 30, nothing after 67.
  const young = { ...inp, careShieldJoinAge: 0, careShieldCatchUp: 0 };
  assert.equal(medicalYear(young, 29, 0, 1e6).careShield, 0);
  assert.equal(medicalYear(young, 30, 0, 1e6).careShield, 800);
  assert.equal(medicalYear(young, 68, 0, 1e6).careShield, 0);
});

test('the engine uses the official MediShield Life premium for each age and reports cash needed', () => {
  const rows = runProjectionEngine({ ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, currentAge: 70, dpsMode: 'optout',
    oaBalance: 0, saBalance: 0, maBalance: 3000, salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0, housingOutflow: 0,
    medicalUsage: 0, elderCareShield: 0, medicalInflationRate: 0, ipPrivatePremium: 0 });
  assert.equal(rows[0].mslPremium, 1643);                        // next birthday 71 (band 71 to 73)
  assert.equal(rows.find((r) => r.age === 75).mslPremium, 2027); // next birthday 76 (band 76 to 78)
  const dry = rows.find((r) => r.medCash > 0);
  assert.ok(dry && dry.age <= 73 && dry.ma === 0, 'once MediSave is empty the premium has to be paid in cash');
});

// Source: CPF Board — "How much CPF savings can I withdraw?"
test('the first $5,000 can be withdrawn at 55 even below the Full Retirement Sum', () => {
  const base = { ...DEFAULT_INPUTS, currentYear: 2026, currentMonth: 6, birthMonth: 6, currentAge: 54, dpsMode: 'optout', maBalance: 0,
    salaryGross: 0, salaryBonus: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0, housingOutflow: 0, medicalUsage: 0, elderCareShield: 0 };
  // Below the FRS with plenty in the OA: $5,000 stays out of the Retirement Account and can be taken.
  const below = { ...base, oaBalance: 30000, saBalance: 50000 };
  const a = runProjectionEngine({ ...below, oaWithdrawalAt55: 20000 }).find((r) => r.age === 55);
  const b = runProjectionEngine(below).find((r) => r.age === 55);
  assert.ok(Math.abs(a.ra - b.ra) < 100, 'the Retirement Account is not reduced (extra interest aside)');
  assert.ok(b.oa - a.oa > 4900 && b.oa - a.oa < 5300, `only $5,000 comes out: OA lower by ${b.oa - a.oa}`);
  // Below the FRS with almost nothing in the OA: the rest of the $5,000 comes from Special Account savings.
  const thin = { ...base, oaBalance: 2000, saBalance: 50000 };
  const e = runProjectionEngine({ ...thin, oaWithdrawalAt55: 5000 }).find((r) => r.age === 55);
  const f = runProjectionEngine(thin).find((r) => r.age === 55);
  assert.ok(f.ra - e.ra > 2800 && f.ra - e.ra < 3300, `RA lower by ${f.ra - e.ra}`);
  assert.ok(e.oa < 100, 'the Ordinary Account is emptied (interest aside)');
  // Above the Full Retirement Sum, the excess can be withdrawn and the RA is untouched.
  const above = { ...base, oaBalance: 200000, saBalance: 150000 };
  const c = runProjectionEngine({ ...above, oaWithdrawalAt55: 50000 }).find((r) => r.age === 55);
  const d = runProjectionEngine(above).find((r) => r.age === 55);
  assert.equal(c.ra, d.ra);
  assert.ok(d.oa - c.oa > 49000 && d.oa - c.oa < 53000);
});
