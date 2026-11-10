/**
 * Main CPF projection engine (CPF LIFE members) plus Die-with-Zero and portfolio helpers.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */
import { _cpfEngineInit, balaRatio, makeComputeGF } from './common.js';
import { ANNUAL_LIMIT, CPF_RATES, MMSS_PILOT_END_YEAR, MMSS_PILOT_START_YEAR, RETIREMENT_SUMS_2026, projectedSum, getDpsPremiumForAge, getPRRates, scAllocBand, scEmployeeRate } from '../policy/cpf2026.js';

// ── BUG-5 fix: runProjectionWithDWZ ─────────────────────────────────────────
// Shared Die-with-Zero multi-pass wrapper — extracts the DWZ logic that was
// previously duplicated inline inside the projection useMemo so scenario A/B
// and the Compare tab capture can also honour DWZ when it is enabled.
//
// If dieWithZeroEnabled is false (or absent), delegates directly to engineFn.
// Otherwise runs up to 4 engine passes to compute the correct OA + private-asset
// monthly draw that depletes both to ~$0 at dieWithZeroAge.
//
// Returns the final engine pass array, with the same _dwz* metadata fields
// the main projection useMemo attaches (used by the DWZ UI panel and PDF).
// ── computePortfolioNetWorth ────────────────────────────────────────────────
// Standalone helper: computes the investment portfolio balance at a target age
// using the same compounding model as portfolioProjection, without needing the
// full React useMemo chain. Used by the Stress Centre and Zone 6 so that
// Portfolio is included in net-worth comparisons even outside the main projection.
export function computePortfolioNetWorth(inputs, targetAge) {
  const startBal      = Number(inputs?.portfolioBalance)              || 0;
  const annualContr   = Number(inputs?.portfolioAnnualContribution)   || 0;
  const ca            = Number(inputs?.currentAge)                    || 35;
  const annualRet     = (Number(inputs?.portfolioAnnualReturn)        || 6) / 100;
  const pa            = Number(inputs?.payoutAge)                     || 65;
  const contribStop   = Number(inputs?.portfolioContribStopAge)       || pa;
  const withdrawMo    = Number(inputs?.portfolioWithdrawalMonthly)    || 0;
  const withdrawStart = Number(inputs?.portfolioWithdrawalStartAge)   || pa;
  let bal = startBal;
  for (let age = ca; age < targetAge; age++) {
    const contrib = age < contribStop ? annualContr : 0;
    const draw    = age >= withdrawStart ? withdrawMo * 12 : 0;
    bal = bal * (1 + annualRet) + contrib - draw;
    if (bal < 0) bal = 0;
  }
  return Math.round(Math.max(0, bal));
}

export function runProjectionWithDWZ(inputs, engineFn) {
  const maxAge = Number(inputs.maxProjectionAge) || 95; // M-DWZ: thread horizon through all engine passes
  if (!inputs.dieWithZeroEnabled) return engineFn(inputs, { maxAge });
  const isRSS = inputs.cpfScheme === 'rss';
  const pa   = isRSS
    ? (Number(inputs.currentAge) || 68)
    : (Number(inputs.payoutAge) || 65);
  const dwzA = Number(inputs.dieWithZeroAge) || 85;
  const n    = Math.max(1, dwzA - pa);
  const rOA  = 0.025;
  const pass1 = engineFn({ ...inputs, oaDrawdownMonthly: 0, oaDrawdownStartAge: 0 }, { maxAge });
  const pass1ByAge = new Map(pass1.map(r => [r.age, r]));
  const oaAtPayout = pass1ByAge.get(pa)?.oa || 0;
  const dwzPmt = oaAtPayout > 0
    ? (rOA > 0 ? Math.round(oaAtPayout * rOA / (1 - Math.pow(1 + rOA, -n)) / 12) : Math.round(oaAtPayout / n / 12))
    : 0;
  const pass2 = engineFn({ ...inputs, oaDrawdownMonthly: dwzPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 }, { maxAge });
  const pass2ByAge = new Map(pass2.map(r => [r.age, r]));
  const residualOa = pass2ByAge.get(dwzA)?.oa || 0;
  let finalPmt  = dwzPmt;
  let finalPass = pass2;
  if (residualOa > 500 && dwzPmt > 0) {
    const correctionMonthly = Math.round(residualOa / Math.max(1, n * 12));
    finalPmt  = dwzPmt + correctionMonthly;
    finalPass = engineFn({ ...inputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 }, { maxAge });
  }
  const finalPassByAge = new Map(finalPass.map(r => [r.age, r]));
  finalPass._dwzOaMonthly  = finalPmt;
  finalPass._dwzStartAge   = pa;
  finalPass._dwzResidualOa = finalPassByAge.get(dwzA)?.oa || 0;
  finalPass._dwzResidualPriv = 0;
  const rPriv = Math.max(0, (Number(inputs.privateAssetGrowthRate) || 0) / 100);
  const privAtPayout = finalPassByAge.get(pa)?.privateAssets || 0;
  let pmtPrivAnnual = privAtPayout > 0
    ? (rPriv > 0 ? Math.round(privAtPayout * rPriv / (1 - Math.pow(1 + rPriv, -n))) : Math.round(privAtPayout / n))
    : 0;
  if (pmtPrivAnnual > 0) {
    let privPass = engineFn(
      { ...inputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 },
      { overridePrivDrawdown: pmtPrivAnnual, overridePrivDrawdownStart: pa, maxAge }
    );
    let privPassByAge = new Map(privPass.map(r => [r.age, r]));
    const residualPriv = privPassByAge.get(dwzA)?.privateAssets || 0;
    if (residualPriv > 500 && pmtPrivAnnual > 0) {
      const correctionAnnual = Math.round(residualPriv / Math.max(1, n));
      pmtPrivAnnual += correctionAnnual;
      privPass = engineFn(
        { ...inputs, oaDrawdownMonthly: finalPmt, oaDrawdownStartAge: pa, oaDrawdownFloor: 0 },
        { overridePrivDrawdown: pmtPrivAnnual, overridePrivDrawdownStart: pa, maxAge }
      );
      privPassByAge = new Map(privPass.map(r => [r.age, r]));
    }
    finalPass = privPass;
    finalPass._dwzOaMonthly   = finalPmt;
    finalPass._dwzStartAge    = pa;
    finalPass._dwzResidualOa  = privPassByAge.get(dwzA)?.oa || 0;
    finalPass._dwzResidualPriv = privPassByAge.get(dwzA)?.privateAssets || 0;
  }
  finalPass._dwzPrivMonthly = Math.round(pmtPrivAnnual / 12);
  return finalPass;
}

// ─── SHARED PROJECTION ENGINE ───────────────────────────────────────────────
// Single source of truth for year-by-year CPF accumulation logic.
// Used by main projection, Monte Carlo, What-If, and sensitivity table
// to eliminate code duplication and ensure policy changes apply everywhere.
export function runProjectionEngine(inputs, {
  overrideContribStop,
  overrideVcSA,
  overrideHousingOutflow,
  overrideSalaryBump,
  overridePrivDrawdown,            // P1-D: annual private-asset draw injected by DWZ two-pass logic
  overridePrivDrawdownStart,       // P1-D: age from which the drawdown begins
  overrideOaDrawdownMonthly,       // Rev #12: What-If OA monthly drawdown override
  overrideSrsContrib,              // Rev #12: What-If SRS annual contribution override
  overridePrivGrowthRate,          // Rev #12: What-If private asset growth rate % override
  maxAge = 95,          // F1: configurable horizon (95/100/105)
  randomiseRates = false,          // Monte Carlo mode: rate variance applied per year
  mcVariance = 1,                  // Rev #MC: variance band in % (e.g. 1 = ±1%). Sourced from inputs.mcVariancePct.
  rng = null,                      // Seeded PRNG — pass seededRandom(seed) for deterministic MC
} = {}) {
  const startAge = Math.max(0, Number(inputs.currentAge) || 0);
  const baseYear = Number(inputs.currentYear) || 2026;
  const contribStop = overrideContribStop !== undefined ? overrideContribStop : (Number(inputs.contributionStopAge) || 95);
  const housingStop = Number(inputs.housingStopAge) || 95;
  // D4 Phase 2: fractional first year — prorate the first iteration's interest to the
  // months remaining from the profile date to the member's next birthday.
  // Example: born Oct (bm=10), current month May (cm=5) → 5 months → fraction = 5/12.
  // All subsequent loop years use yearFraction = 1.0 (full year).
  // System clock read once per engine invocation; stable within a session.
  const _bm_pe  = Math.min(12, Math.max(1, Number(inputs.birthMonth) || 6));
  const _cm_pe = Number(inputs.currentMonth) >= 1 && Number(inputs.currentMonth) <= 12 ? Number(inputs.currentMonth) : new Date().getMonth() + 1;                      // 1–12
  const _mn_pe  = (((_bm_pe - _cm_pe) % 12) + 12) % 12 || 12;  // months to next birthday; 0 → 12 (birthday this month = full year)
  const firstYearFraction = Math.max(1 / 12, Math.min(1, _mn_pe / 12));
  // Item 5 + SRS cap — from shared _cpfEngineInit helper (defined before runRSSEngine).
  // srsCap pulled here (early) so only one declaration exists in this function.
  const { _oaRateBase, _saRateBase, _maRateBase, srsCap } = _cpfEngineInit(inputs);
  const salaryGrowth = (Number(inputs.salaryGrowthRate) || 0) / 100;
  const salaryBump = (overrideSalaryBump || 0) / 100;
  // Rev #22: phased salary & career break constants
  // Phase 2 optional: 0 treated same as "" — Phase 2 disabled.
  const _salaryPhaseRaw2     = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null ? Number(inputs.salaryPhaseAge) : null;
  const salaryPhaseAge       = _salaryPhaseRaw2 === 0 ? null : _salaryPhaseRaw2;
  const salaryGrowthRate2    = (Number(inputs.salaryGrowthRate2) || 0) / 100;
  // Career break is now handled exclusively via Life Events (type: 'career_break') through leContribPaused.
  // computeGF: returns the salary growth factor at a given age, respecting phase change only.
  // Phase 1: (1+r1)^(age-startAge). Phase 2 (age >= phaseAge): (1+r1)^(phaseAge-startAge) * (1+r2)^(age-phaseAge).
  // Contribution zeroing during a career break is handled upstream by leContribPaused before computeGF is called.
  // BUG-10 fix: use shared makeComputeGF factory — removed duplicate inline definition.
  const computeGF = makeComputeGF(startAge, salaryGrowth, salaryPhaseAge, salaryGrowthRate2);

  const baseOA_Emp = Number(inputs.empOaCont) || 0;
  const baseSA_Emp = Number(inputs.empSaCont) || 0;
  const baseMA_Emp = Number(inputs.empMaCont) || 0;
  // ── Secondary employment — stacked on top of primary salary (PE engine) ───
  const _secEnabled = !!inputs.secondaryEmploymentEnabled;
  const _secGross   = _secEnabled ? (Number(inputs.secondarySalaryGross) || 0) : 0;
  const _secOA_base = Math.round(_secGross * 0.23 * 12);
  const _secSA_base = Math.round(_secGross * 0.06 * 12);
  const _secMA_base = Math.round(_secGross * 0.08 * 12);
  // VC3A: single cash lump-sum, auto-split by age-band rates (same as mandatory).
  // Replaces separate vcOaTopup/vcSaTopup/vcMaTopup — all go through age-band proportional split.
  const vc3aCash = Number(inputs.vc3aCash) || 0;
  // VHR (housing refund) goes to OA separately
  const vcVhrAmt = Number(inputs.vcVhr) || 0;
  // RSTU: cash top-up to SA (pre-55) or RA (post-55) is handled via cappedVcSA in the employed/SEP
  // contribution blocks below. vcSA_RSTU was a dead variable here — removed (BUG-06 fix).
  const annualOaToSa = Number(inputs.oaToSaTransfer) || 0;
  const annualOaToMa = Number(inputs.oaToMaTransfer) || 0;
  const oaToMaForLovedOne = inputs.oaToMaForLovedOne === true;
  const oaToSaForLovedOne = inputs.oaToSaForLovedOne === true;
  // Frequency flags — used to zero out recurring fields for 'one-time' application
  const vc3aFreq     = inputs.vc3aFreq     || 'annual';
  const vcSaFreq     = inputs.vcSaFreq     || 'annual';
  const vcMaFreq     = inputs.vcMaFreq     || 'annual';
  const vcVhrFreq    = inputs.vcVhrFreq    || 'annual';
  const govGrantFreq   = inputs.govGrantFreq   || 'annual';
  const govGrantMaFreq = inputs.govGrantMaFreq || 'annual';
  // mmssFreq removed — MMSS ties to effVcMaFreq, not a separate toggle
  const wisFreq      = inputs.wisFreq      || 'annual';
  const cpfisOaFreq   = inputs.cpfisOaFreq   || 'annual';
  const cpfisSaFreq   = inputs.cpfisSaFreq   || 'annual';
  const housingFreq   = inputs.housingFreq   || 'annual';
  const oaWithdrawalFreq = inputs.oaWithdrawalFreq || 'one-time';
  const oaToMaFreq    = inputs.oaToMaFreq    || 'annual';
  const oaToSaFreq    = inputs.oaToSaFreq    || 'annual';
  // Duration limits for recurring fields (0 = indefinite; N = stop after N projection years from startAge)
  const vc3aDur      = Number(inputs.vc3aDur)      || 0;
  const vcSaDur      = Number(inputs.vcSaDur)      || 0;
  const vcMaDur      = Number(inputs.vcMaDur)      || 0;
  const vcVhrDur     = Number(inputs.vcVhrDur)     || 0;
  const govGrantDur    = Number(inputs.govGrantDur)    || 0;
  const govGrantMaDur  = Number(inputs.govGrantMaDur)  || 0;
  // mrssDur removed — MRSS frequency mirrors RSTU (vcSaFreq) by CPF policy; no separate freq/dur control needed
  // mmssDur removed — dead field, never read by MMSS engine block
  const wisDur       = Number(inputs.wisDur)       || 0;
  const cpfisOaDur   = Number(inputs.cpfisOaDur)   || 0;
  const cpfisSaDur   = Number(inputs.cpfisSaDur)   || 0;
  const housingDur   = Number(inputs.housingDur)   || 0;
  const oaToMaDur    = Number(inputs.oaToMaDur)    || 0;
  const oaToSaDur    = Number(inputs.oaToSaDur)    || 0;
  const oaEduLoanDur = Number(inputs.oaEduLoanDur) || 0;
  const oaWithdrawalDur = Number(inputs.oaWithdrawalDur) || 0;
  const vcMaCash = Number(inputs.vcMaCash) || 0;
  // MRSS and MMSS are now auto-derived inside the projection loop:
  //   MRSS = min(vcSaTopup * effVcSaFreq, 2000, lifetimeCapRemaining) when eligible
  //   MMSS = min(vcMaCash * effVcMaFreq, 1000, maRoom) when eligible
  // mrssGrant and mmssGrant inputs are no longer user-entered and are always 0.
  // Citizenship gate: MRSS and MMSS are Singapore Citizens only.
  // PR members cannot receive either grant regardless of age or account balance.
  // Rev #5: User-controllable retirement sum growth rate. Replaces the former rsGrowth
  // constant throughout the engine. All FRS/BHS/BRS/ERS projections use this rate.
  // Legacy profiles without the field default to 3% (historical CPF Board average).
  const rsGrowth = (Number(inputs.retirementSumGrowth) || 3) / 100;

  const _csNorm = (inputs.citizenStatus || 'SC').toUpperCase(); // Bug 2 fix: normalise case
  const isSC = _csNorm === 'SC'; // default to SC if field absent (legacy profiles)
  // PwD gate: MRSS is available below age 55 for PwD members with OA+SA below BRS (from 2026).
  const isPwD = !!inputs.isPwD;
  // WIS: Workfare Income Supplement
  //   Employees:  60% allocated to CPF accounts via age-band rates, 40% cash (not modelled in CPF)
  //   SEP:        90% to MA (subject to BHS), 10% cash (not modelled in CPF)
  const wisAmount = Number(inputs.wisAmount) || 0;
  const cpfisOaAmount = Number(inputs.cpfisOaAmount) || 0;
  // SA CPFIS: only investible pre-55 (SA closes at 55); SA above $40,000 required.
  const cpfisSaAmount = Number(inputs.cpfisSaAmount) || 0;
  const baseHousing = overrideHousingOutflow !== undefined ? overrideHousingOutflow : (Number(inputs.housingOutflow) || 0);
  const oaEduLoanAnnual = Number(inputs.oaEduLoan) || 0;  // D1: OA Education Loan Scheme outflow
  const oaEduLoanFreq   = inputs.oaEduLoanFreq || 'one-time';
  const baseMedical = (Number(inputs.medicalUsage) || 0) + (Number(inputs.medishieldIP) || 0);
  const elderCareShieldAmt = Number(inputs.elderCareShield) || 0; // Q1-C: CareShield Life only begins at age 30 — gated in loop
  // Housing grants + insurance — declared here so engine loop can reference them
  // Housing grants — same property-type gating as RSS engine (see _totalHousingGrants for detail).
  const _pTypePE = inputs.propertyType || 'hdb_bto';
  const _totalHousingGrantsPE = (_pTypePE === 'hdb_bto' || _pTypePE === 'hdb_resale') ? (
    (Number(inputs.ehgAmount)||0)
    + (_pTypePE === 'hdb_resale' ? (Number(inputs.cpfHousingGrantResale)||0) + (Number(inputs.phgAmount)||0) : 0)
    + (_pTypePE === 'hdb_bto' ? (Number(inputs.stepUpGrantAmount)||0) : 0)
  ) : 0;
  const _dpsModePE = inputs.dpsMode || 'auto'; // "auto"|"optout"|"custom"
  const _hpsAnnualPE = Number(inputs.hpsAnnualPremium) || 0;
  const medInfl = (Number(inputs.medicalInflationRate) || 0) / 100;
  const isSEP = inputs.isSelfEmployed === true;
  const isLeasehold = inputs.propertyLeasehold === true;
  const totalLease = Math.max(1, Number(inputs.propertyLeaseYears) || 99);
  const propGrowth = (Number(inputs.propertyGrowthRate) || 0) / 100;
  // B1: Bala Curve — freehold-equivalent anchor (mirrors runRSSEngine logic above)
  const _initBalaR2    = isLeasehold ? balaRatio(totalLease) : 1;
  const freeholdEquiv2 = (_initBalaR2 > 0) ? (Number(inputs.propertyValue) || 0) / _initBalaR2 : (Number(inputs.propertyValue) || 0);
  const usePropertyPledge = inputs.usePropertyPledge === true;

  // Phase 2: Private Assets & Housing Downpayment
  let privateAssets = Number(inputs.currentPrivateAssets) || 0;
  const privateGrowth = overridePrivGrowthRate !== undefined ? overridePrivGrowthRate / 100 : (Number(inputs.privateAssetGrowthRate) || 0) / 100;
  const privateSaving = Number(inputs.annualPrivateSaving) || 0;
  const plannedDownpaymentOA = Number(inputs.plannedDownpaymentOA) || 0;
  const downpaymentAge = Number(inputs.downpaymentAge) || 35;
  let downpaymentApplied = startAge > downpaymentAge;
  let housingGrantApplied = startAge > downpaymentAge; // mirrors downpaymentApplied — both fire at downpaymentAge
  // Contributions grow at srsReturnRate. At srsDrawdownStartAge the balance is drawn down
  // evenly over srsDrawdownYears (must deplete within 10 yrs of first withdrawal per IRAS rules).
  // Only 50% of each annual withdrawal is taxable income (statutory retirement age concession).
  // srsCap comes from _cpfEngineInit (called at the rate-override block above).
  // Foreigner $35,700/yr · SC/PR $15,300/yr (POL-3 / BUG-9). validateInputs independently
  // derives the same cap from `inp` — both read their own function parameter, no shared state.
  const srsContrib = overrideSrsContrib !== undefined ? Math.min(overrideSrsContrib, srsCap) : Math.min(Number(inputs.srsAnnualContribution) || 0, srsCap);
  const srsContribStop = Number(inputs.srsContribStopAge) || 63;
  const srsReturn = (Number(inputs.srsReturnRate) || 0) / 100;
  const srsDrawStart = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63); // min statutory age 63
  const srsDrawYears = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10); // 1–10 yrs
  let srsBalance = Number(inputs.srsBalance) || 0;
  let srsDrawdownApplied = startAge >= srsDrawStart;
  let srsAnnualDraw = 0; // computed once at drawdown start age
  // Sprint-5 Item 23: rising equity glidepath helpers (no-op when disabled)
  const srsGlidepath_e2  = !!inputs.srsGlidepathEnabled;
  const srsEqPct0_e2     = Math.min(1, Math.max(0, (Number(inputs.srsGlidepathStartEquityPct) || 30) / 100));
  const srsEqRet_e2      = (Number(inputs.srsGlidepathEquityReturn) || 7) / 100;
  const srsBndRet_e2     = (Number(inputs.srsBondReturn) || 3) / 100;
  const srsYearReturn_e2 = (age) => {
    if (!srsGlidepath_e2 || age < srsDrawStart) return srsReturn;
    const eqPct = Math.min(0.60, srsEqPct0_e2 + 0.02 * (age - srsDrawStart));
    return eqPct * srsEqRet_e2 + (1 - eqPct) * srsBndRet_e2;
  };
  const avgGpReturn_e2 = (() => {
    if (!srsGlidepath_e2 || !srsDrawdownApplied || srsDrawYears <= 0) return srsReturn;
    let _gpSum2 = 0;
    for (let _i2 = 0; _i2 < srsDrawYears; _i2++) {
      const _eqP2 = Math.min(0.60, srsEqPct0_e2 + 0.02 * _i2);
      _gpSum2 += _eqP2 * srsEqRet_e2 + (1 - _eqP2) * srsBndRet_e2;
    }
    return _gpSum2 / srsDrawYears;
  })();
  // BUG-2 fix: when member is already past drawdown start age, the loop guard
  // (age === srsDrawStart && !srsDrawdownApplied) can never fire. Pre-compute
  // srsAnnualDraw here so the balance depletes correctly from the first year.
  if (srsDrawdownApplied && srsBalance > 0 && srsDrawYears > 0) {
    const _pmt2 = avgGpReturn_e2;
    srsAnnualDraw = _pmt2 > 0
      ? Math.round(srsBalance * _pmt2 / (1 - Math.pow(1 + _pmt2, -srsDrawYears)))
      : Math.round(srsBalance / srsDrawYears);
  }

  // Cohort FRS at age 55
  const yearsTo55 = Math.max(0, 55 - startAge);
  const projFRS55 = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + yearsTo55) - 2026)));
  const past55FRS = Math.round(RETIREMENT_SUMS_2026.FRS / Math.pow(1 + rsGrowth, Math.max(0, startAge - 55)));
  // Property pledge allows keeping only BRS in RA (rest can be withdrawn / kept in OA)
  const cohortRetSum = usePropertyPledge
    ? (startAge >= 55 ? Math.round(RETIREMENT_SUMS_2026.BRS / Math.pow(1 + rsGrowth, Math.max(0, startAge - 55)))
      : Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + yearsTo55) - 2026))))
    : (startAge >= 55 ? past55FRS : projFRS55);

  let oa = Number(inputs.oaBalance) || 0;
  let sa = Number(inputs.saBalance) || 0;
  let ma = Number(inputs.maBalance) || 0;
  let ra = startAge >= 55 ? sa : 0;
  if (startAge >= 55) sa = 0;

  let totalInjected = 0, totalInterest = 0, totalOutSpent = 0;
  // #3 Property CPF refund: track cumulative OA housing withdrawals for refund calc
  const sellPropertyAge = Number(inputs.sellPropertyAge) || 0;
  let cumHousingOA = 0;        // tracks cumulative OA used for housing (principal)
  let cumEduOut = 0;           // P3-B: cumulative OA education loan withdrawals for 40% cap anchoring
  // cumHousingFV tracks the compound future value of ALL OA housing withdrawals at 2.5%/yr.
  // Each year: cumHousingFV = (cumHousingFV + activeHousing) * 1.025
  // This correctly compounds each year's withdrawal forward from its own date.
  // At sell time: totalRefund = cumHousingFV (principal + compounded interest).
  // Accrued interest = cumHousingFV - cumHousingOA.
  let cumHousingFV = 0;
  let refundApplied = startAge >= sellPropertyAge && sellPropertyAge > 0;
  // Track SA/RA cash top-ups (vcSa + govGrant + mrss) and interest earned on RA
  // separately — needed to compute the correct 20% RA-to-OA transfer base.
  // Policy: transfer base = RA at payout − (cumulative SA/RA cash top-ups + cumulative RA interest)
  let cumRaCashTopUps = 0;  // vcSaTopup + annualGovGrant + mrssGrant credited to SA/RA
  let cumRaInterest = 0;  // interest accruing to SA (pre-55) and RA (post-55) accounts
  // MRSS lifetime cap: $20,000 per member. Track cumulative amount received to stop at cap.
  let cumMrssReceived = 0;
  let currentPropValue = Number(inputs.propertyValue) || 0;
  let leaseRemaining = totalLease;
  // OA withdrawal at 55: applied once when age 55 is reached
  const oaWithdrawalAt55 = Number(inputs.oaWithdrawalAt55) || 0;
  let withdrawalApplied = startAge >= 55; // already past 55 → already happened
  // Pledge RA withdrawal: only applies when pledge is ON; withdrawn directly from RA at pledgeWithdrawalAge
  const pledgeWithdrawalAmount = (usePropertyPledge && Number(inputs.pledgeWithdrawalAmount)) ? Number(inputs.pledgeWithdrawalAmount) : 0;
  const pledgeWithdrawalAge = Math.max(55, Number(inputs.pledgeWithdrawalAge) || 55);
  let pledgeWithdrawalApplied = startAge >= pledgeWithdrawalAge;
  // RA→OA transfer at payout age (non-RSS): fires once at age === pa when applyRaOaTransfer is ON.
  // Pre-set to true when member is already past payout age so the block never double-fires.
  const _pePayoutAge = Number(inputs.payoutAge) || 65;
  let raOaXferApplied = startAge >= _pePayoutAge;

  // OA Drawdown: post-payout-age supplementary cash drawn from OA
  // Supplements CPF LIFE shortfall; stops when OA hits oaDrawdownFloor.
  const oaDrawdownStartAge = Number(inputs.oaDrawdownStartAge) || 0;
  const oaDrawdownMonthly = overrideOaDrawdownMonthly !== undefined ? overrideOaDrawdownMonthly : (Number(inputs.oaDrawdownMonthly) || 0);
  const oaDrawdownAnnual = oaDrawdownMonthly * 12;
  const oaDrawdownFloor = Number(inputs.oaDrawdownFloor) || 0;
  const oaDrawdownActive = oaDrawdownStartAge > 0 && oaDrawdownMonthly > 0;

  // Property Monetisation: one-time event (downgrade / LBS / Silver Housing Bonus)
  // Cash proceeds go to member's bank account (private assets); RA top-up credited to RA.
  const propMonetiseEnabled = inputs.propMonetiseEnabled === true;
  const propMonetiseAge = Number(inputs.propMonetiseAge) || 65;
  const propMonetiseCash = Number(inputs.propMonetiseCashProceeds) || 0;
  const propMonetiseRaTopup = Number(inputs.propMonetiseRaTopup) || 0;
  let propMonetiseApplied = startAge >= propMonetiseAge && propMonetiseEnabled;
  // LBS ongoing monthly payout — only active when scheme is 'lbs'
  const _lbsMonthlyPE = (propMonetiseEnabled && inputs.propMonetiseScheme === 'lbs') ? (Number(inputs.lbsMonthlyPayout) || 0) : 0;
  const _lbsEndAgePE  = Number(inputs.lbsPayoutEndAge) || 85;
  // Rental income — recurring monthly cash inflow from property rental
  const _rentalMonthlyPE = Number(inputs.rentalIncome) || 0;
  const _rentalStartPE   = Number(inputs.rentalStartAge) || 0;
  const _rentalEndPE     = Number(inputs.rentalEndAge) || 85;
  const _rentExpMonthlyPE = Number(inputs.rentExpense) || 0;
  const _rentExpStartPE   = Number(inputs.rentExpStartAge) || 0;
  const _rentExpEndPE     = Number(inputs.rentExpEndAge) || 85;

  // AW ceiling: $102,000 − Total Ordinary Wages subject to CPF for the year
  // (NOT the CPF contributions themselves — the OW wages, capped at $8,000/mo × 12 = $96,000)
  // E.g. if OW = $8,000/mo → OW subject to CPF = $96,000 → AW ceiling = $102,000 − $96,000 = $6,000
  const owMonthly = Math.min(Number(inputs.salaryGross) || 0, 8000);
  const owAnnualSubjectToCPF = owMonthly * 12;
  const awCeiling = Math.max(0, 102000 - owAnnualSubjectToCPF);

  // PR tenure rate advancement
  // isPR: true only for PR members; SC and undefined default to SC behaviour.
  // startPrYear: the PR tenure year the member is currently in (1, 2, or 3+).
  //   Clamped to [1, 3] — 3 means "Year 3 and beyond" (full SC/PR3+ rates).
  // annualGrossSalary: annual OW subject to CPF (capped at $8,000/mo), used to
  //   derive mandatory OA/SA/MA from the G/G rate table when isPR && currentPrYear < 3,
  //   and for the graduated PR→SC transition (startPrYear < 3, currentPrYear >= 3).
  // currentPrYear: mutable counter incremented each loop iteration; drives
  //   the rate-tier switch from Year 1 → Year 2 → Year 3+ automatically.
  // Three engine paths (see mandatory-contribution block):
  //   A. currentPrYear < 3 → PR rate table × (OW + AW)   [Yr1/Yr2]
  //   B. startPrYear < 3, currentPrYear >= 3 → SC/PR3+ rates × gross salary [graduated]
  //   C. SC or PR3+ from start → baseOA_Emp * gf          [standard]
  const isPR = _csNorm === 'PR';
  const isForeigner = _csNorm === 'FOREIGNER'; // BUG-1 fix: _csNorm is .toUpperCase() so must compare uppercase — B1: foreigners have no CPF
  const startPrYear = Math.min(3, Math.max(1, Number(inputs.prYear) || 3));
  const annualGrossSalary = owMonthly * 12; // already capped at $8,000/mo above
  let currentPrYear = startPrYear;
  // MMSS carry: grant earned in year N is credited to MA at the start of year N+1 per CPF policy.
  // Set to actualMmss at end of eligible year; applied and reset at the top of the following year.
  let pendingMmssCarry = 0;
  // C2 fix: early_retirement is isPoint:true (endAge === startAge), so activeEvents only matches
  // for one year. Track a persistent flag so contributions remain blocked for all subsequent years.
  let earlyRetireFired = false;

  const data = [];

  // BHS locked at member's 65th birthday — mirrors SEP branch constant above.
  const bhsLockedYear = Math.max(2026, baseYear + (65 - startAge));

  for (let age = startAge; age <= maxAge; age++) {
    let yearInflow = 0;
    // Per-category flow trackers (reset each year for cashflow ledger)
    let yearMandatory = 0;
    let yearVoluntary = 0;
    let yearGovGrants = 0;
    let yearWisCash = 0;   // BUG-44: WIS cash portion paid directly to member (not in CPF) — for Data Table display only
    let yearOaInterest = 0;
    let yearSaRaInterest = 0;
    let yearMaInterest = 0;
    let yearHousingOut = 0;
    let yearMedOut = 0;
    let yearOaDrawOut = 0;
    let yearLovedOneOut = 0; // OA→MA/SA for loved one (true outflow)
    // Rev #D2: life event flow trackers (reset each year)
    let yearEventsIn  = 0;  // windfall inflows
    let yearEventsOut = 0;  // medical_crisis outflows

    // ── Rev #D2: Resolve active life events for this age ─────────────────────
    const activeEvents = (inputs.lifeEvents || []).filter(
      e => e.enabled !== false && Number(e.startAge) <= age && age <= Number(e.endAge)
    );
    // Flags derived from active events — used throughout the loop below
    const leContribPaused    = activeEvents.some(e => e.type === 'retrenchment' || e.type === 'career_break');
    const leEarlyRetire      = activeEvents.some(e => e.type === 'early_retirement');
    // C2 fix: once early_retirement fires, set the persistent flag so all future years
    // also block contributions (isPoint:true means activeEvents only matches for one year).
    if (leEarlyRetire) earlyRetireFired = true;
    const leHyperinflation   = activeEvents.find(e => e.type === 'hyperinflation');
    const leMedicalEvents    = activeEvents.filter(e => e.type === 'medical_crisis');
    const leWindfallEvents   = activeEvents.filter(e => e.type === 'windfall' && age === Number(e.startAge));
    // New event types (gap-analysis pass) — mirrored from main engine
    const leMarriageEvent    = activeEvents.find(e => e.type === 'marriage' && age === Number(e.startAge));
    const leChildBirth       = activeEvents.find(e => e.type === 'child_birth' && age === Number(e.startAge));
    const leLoanEvents       = activeEvents.filter(e => e.type === 'loan_repayment');
    const leParentSupport    = activeEvents.filter(e => e.type === 'parent_support');
    const leEducation        = activeEvents.filter(e => e.type === 'education_expense');
    const leDonation         = activeEvents.filter(e => e.type === 'donation');
    const leBaristaFire    = activeEvents.find(e => e.type === 'barista_fire');
    const baristaMonthly   = leBaristaFire ? (Number(leBaristaFire.magnitude) || 0) : 0;
    const baristaAnnual    = baristaMonthly * 12;
    // Monthly part-time pay vs monthly salary (salaryGross is monthly). Part-time pay is assumed
    // to grow with the same salary-growth path, so contributions scale by this ratio.
    const baristaScale     = (baristaMonthly > 0 && (Number(inputs.salaryGross) || 0) > 0)
      ? Math.min(1, baristaMonthly / Number(inputs.salaryGross))
      : 0;
    // MMSS grants earned in year N are credited to MA at the start of year N+1 per CPF policy.
    // yearInflow + totalInjected are updated here at the correct year (not at grant computation time).
    if (pendingMmssCarry > 0) {
      ma += pendingMmssCarry;
      yearGovGrants += pendingMmssCarry;
      yearInflow += pendingMmssCarry;
      totalInjected += pendingMmssCarry;
      pendingMmssCarry = 0;
    }

    // ── Frequency & duration gating ──────────────────────────────────────────────
    // 'one-time' fields fire only in the first projection year.
    // 'annual' fields with a duration (dur > 0) fire for the first dur years then stop.
    // yearIdx is 0-based: 0 = current age, 1 = next year, etc.
    const isFirstYear = age === startAge;
    const yearIdx     = age - startAge;
    const effVc3aFreq    = vc3aFreq     === 'one-time' && !isFirstYear ? 0 : (vc3aDur     > 0 && yearIdx >= vc3aDur)     ? 0 : 1;
    const effVcSaFreq    = vcSaFreq     === 'one-time' && !isFirstYear ? 0 : (vcSaDur     > 0 && yearIdx >= vcSaDur)     ? 0 : 1;
    const effVcMaFreq    = vcMaFreq     === 'one-time' && !isFirstYear ? 0 : (vcMaDur     > 0 && yearIdx >= vcMaDur)     ? 0 : 1;
    const effVcVhrFreq   = vcVhrFreq    === 'one-time' && !isFirstYear ? 0 : (vcVhrDur    > 0 && yearIdx >= vcVhrDur)    ? 0 : 1;
    const effGovGrantFreq   = govGrantFreq   === 'one-time' && !isFirstYear ? 0 : (govGrantDur   > 0 && yearIdx >= govGrantDur)   ? 0 : 1;
    const effGovGrantMaFreq = govGrantMaFreq === 'one-time' && !isFirstYear ? 0 : (govGrantMaDur > 0 && yearIdx >= govGrantMaDur) ? 0 : 1;
    const effWisFreq     = wisFreq      === 'one-time' && !isFirstYear ? 0 : (wisDur      > 0 && yearIdx >= wisDur)      ? 0 : 1;
    const effCpfisOaFreq  = cpfisOaFreq  === 'one-time' && !isFirstYear ? 0 : (cpfisOaDur  > 0 && yearIdx >= cpfisOaDur)  ? 0 : 1;
    const effCpfisSaFreq  = cpfisSaFreq  === 'one-time' && !isFirstYear ? 0 : (cpfisSaDur  > 0 && yearIdx >= cpfisSaDur)  ? 0 : 1;
    const effHousingFreq  = housingFreq  === 'one-time' && !isFirstYear ? 0 : (housingDur  > 0 && yearIdx >= housingDur)  ? 0 : 1;
    const effOaToMaFreq   = oaToMaFreq   === 'one-time' && !isFirstYear ? 0 : (oaToMaDur   > 0 && yearIdx >= oaToMaDur)   ? 0 : 1;
    const effOaToSaFreq   = oaToSaFreq   === 'one-time' && !isFirstYear ? 0 : (oaToSaDur   > 0 && yearIdx >= oaToSaDur)   ? 0 : 1;


    // Gov Grant to MA (e.g. MediSave Grant for Newborns, CHAS, ElderFund).
    // Previously hardcoded as MGN; now driven by govGrantMa input. BHS-capped.
    const bhsNow = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
    const govGrantMaAmt = Math.min((Number(inputs.govGrantMa) || 0) * effGovGrantMaFreq, Math.max(0, bhsNow - ma));
    if (govGrantMaAmt > 0) {
      ma += govGrantMaAmt;
      yearGovGrants += govGrantMaAmt;
      yearInflow    += govGrantMaAmt;
      totalInjected += govGrantMaAmt;
    }

    let yearCpfisOut = 0;    // CPFIS outflow from OA + SA this year
    let yearEduOut = 0;      // D1: OA Education Loan Scheme outflow this year
    let yearRentExpOut = 0;  // Rent expense: monthly rent paid as tenant, debited from private assets

    // ── Mid-year (June) convention: capture OPENING balances before any inflows ──
    // CPF Board rule: contributions received in month M earn from month M+1.
    // Averaging opening + closing gives each inflow ~6 months, each outflow ~6
    // months of interest — the closest annual-model approximation to CPF actual.
    const oaOpen = oa, saOpen = sa, maOpen = ma, raOpen = ra;

    // Phase 2: Private Assets Growth + DWZ Drawdown
    // P1-D fix: when overridePrivDrawdown is injected by the DWZ two-pass logic, the engine
    // deducts the annual draw from private assets (post-growth) so charts reflect reality.
    let yearPrivDrawOut = 0;
    if (age > startAge) {
      privateAssets = privateAssets * (1 + privateGrowth) + privateSaving;
    } else {
      privateAssets += privateSaving;
    }
    // Barista FIRE: credit take-home pay to privateAssets
    if (leBaristaFire && baristaAnnual > 0) {
      const _baristaEmpCPF2   = Math.round(baristaAnnual * scEmployeeRate(age, baseYear + (age - startAge))); // employee share only
      const _baristaTakeHome2 = Math.max(0, baristaAnnual - _baristaEmpCPF2);
      privateAssets += _baristaTakeHome2;
      yearInflow    += _baristaTakeHome2;
    }
    if (overridePrivDrawdown > 0 && overridePrivDrawdownStart > 0 && age >= overridePrivDrawdownStart) {
      const actualPrivDraw = Math.min(overridePrivDrawdown, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actualPrivDraw);
      yearPrivDrawOut = actualPrivDraw;
    }

    // SRS accumulation and drawdown
    // 1. Growth (Item 23: glidepath-aware; falls back to flat srsReturn when disabled)
    if (age > startAge) srsBalance = srsBalance * (1 + srsYearReturn_e2(age));
    // 2. Annual contribution (age 18+ only per IRAS rules; up to stop age, only before drawdown starts)
    if (age >= 18 && age <= srsContribStop && age < srsDrawStart) srsBalance += srsContrib;
    // 3. Drawdown: compute fixed annual draw at drawdown start, then deplete over srsDrawYears
    if (age === srsDrawStart && !srsDrawdownApplied) {
      // PMT = PV × r / (1 − (1+r)^−n) using average blended glidepath return
      const _pmt2r = avgGpReturn_e2;
      srsAnnualDraw = srsDrawYears > 0
        ? (_pmt2r > 0
            ? Math.round(srsBalance * _pmt2r / (1 - Math.pow(1 + _pmt2r, -srsDrawYears)))
            : Math.round(srsBalance / srsDrawYears))
        : srsBalance;
      srsDrawdownApplied = true;
    }
    if (srsDrawdownApplied && age >= srsDrawStart && age < srsDrawStart + srsDrawYears) {
      srsBalance = Math.max(0, srsBalance - srsAnnualDraw);
    }
    // PMT formula produces near-zero balance at final year; cleanup handles any float residual
    if (srsDrawdownApplied && age === srsDrawStart + srsDrawYears - 1) srsBalance = 0;

    // Housing grants — one-time OA credit at downpaymentAge (CPF refund tracking: included in cumHousingOA/FV)
    if (!housingGrantApplied && age === downpaymentAge && _totalHousingGrantsPE > 0 && !isForeigner) {
      oa += _totalHousingGrantsPE;
      cumHousingOA += _totalHousingGrantsPE;
      cumHousingFV  += _totalHousingGrantsPE;
      housingGrantApplied = true;
    }

    // Phase 2: Property Downpayment from OA
    if (age === downpaymentAge && plannedDownpaymentOA > 0 && !downpaymentApplied) {
      const actualDownpayment = Math.min(oa, plannedDownpaymentOA);
      oa -= actualDownpayment;
      cumHousingOA += actualDownpayment;
      cumHousingFV  += actualDownpayment;   // start compounding interest from downpayment year
      downpaymentApplied = true;
    }

    // SA closure at 55
    if (age === 55 && startAge < 55) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
      // CPF policy (Slide 21): if FRS cannot be met, retain at least $5,000 in OA for withdrawal.
      const fromOA = Math.min(Math.max(0, oa - 5000), req); ra += fromOA; oa -= fromOA;
    } else if (age === startAge && startAge >= 55 && sa > 0) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
    }

    // OA withdrawal at 55 — one-time (default: deduct once at 55) or annual (deduct every year from 55+)
    if (oaWithdrawalAt55 > 0) {
      // NX2 fix: both paths now (a) respect oaDrawdownFloor, (b) credit yearOaDrawOut so the
      // withdrawal appears in the cashflow ledger OA-draw column, and (c) increment totalOutSpent
      // so cumulativeOutflow is correct. Previously OA simply shrank silently with no ledger trace.
      if (oaWithdrawalFreq === 'annual') {
        if (age >= 55 && (oaWithdrawalDur === 0 || yearIdx < oaWithdrawalDur)) {
          const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor));
          oa            -= actualW55;
          yearOaDrawOut += actualW55;
          totalOutSpent += actualW55;
        }
      } else {
        if (age === 55 && !withdrawalApplied) {
          const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor));
          oa            -= actualW55;
          yearOaDrawOut += actualW55;
          totalOutSpent += actualW55;
          withdrawalApplied = true;
        }
      }
    }

    // RA→OA transfer at payout age (non-RSS CPF LIFE members only).
    // Fires exactly once at age === payoutAge when applyRaOaTransfer toggle is ON.
    // Mirrors the RSS engine's migRaOaTransfer logic (runRSSEngine lines ~1969–1978).
    // OA boosted, RA reduced — downstream rows reflect the changed balances automatically.
    if (inputs.applyRaOaTransfer && !raOaXferApplied && age === _pePayoutAge) {
      const _xferBy   = (Number(inputs.birthYear) > 0) ? Number(inputs.birthYear) : (baseYear - startAge);
      const _xferBase = Math.max(0, ra - cumRaCashTopUps);
      const _xferPct  = _xferBy >= 1958 ? 0.20 : _xferBy === 1957 ? 0.10 : 0;
      const _xferRaw  = Math.round(_xferBase * _xferPct);
      const _xferAmt  = _xferBy >= 1958 ? Math.max(0, _xferRaw - 5000) : _xferRaw;
      if (_xferAmt > 0) { oa += _xferAmt; ra -= _xferAmt; }
      raOaXferApplied = true;
    }

    // Pledge RA withdrawal: member applies to withdraw pledged RA funds (above BRS) as cash at pledgeWithdrawalAge
    // Funds leave CPF entirely (go to bank account). Only deducted if pledge is ON and age matches.
    if (usePropertyPledge && pledgeWithdrawalAmount > 0 && age === pledgeWithdrawalAge && !pledgeWithdrawalApplied) {
      // Can only withdraw RA above BRS
      const projBRS_pw = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
      const maxWithdrawable = Math.max(0, ra - projBRS_pw);
      const actualPledgeWithdraw = Math.min(pledgeWithdrawalAmount, maxWithdrawable);
      ra = Math.max(0, ra - actualPledgeWithdraw);
      // P1-A fix: credit outflow trackers so cumulative outflow KPI and cashflow ledger are correct
      totalOutSpent += actualPledgeWithdraw;
      yearOaDrawOut += actualPledgeWithdraw; // reuse OA-draw ledger column (cash-out from CPF)
      pledgeWithdrawalApplied = true;
    }

    // OA→SA transfer (annual/one-time, before 55 only)
    // Policy: capped at (1) OA balance and (2) FRS headroom in SA (self only).
    // For loved one: OA is simply an outflow; SA/RA of the loved one is not tracked here.
    if (age < 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const actualTransfer = oaToSaForLovedOne
        ? Math.min(annualOaToSa, oa)
        : (() => {
            const projFRS_oaToSa = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
            const saRoom_oaToSa = Math.max(0, projFRS_oaToSa - sa);
            return Math.min(annualOaToSa, oa, saRoom_oaToSa);
          })();
      oa -= actualTransfer;
      if (!oaToSaForLovedOne) {
        sa += actualTransfer;
      } else {
        yearLovedOneOut += actualTransfer;
        totalOutSpent += actualTransfer;
      }
    }
    // OA→RA transfer (annual/one-time, age 55 and above only)
    // Policy: voluntary transfers to loved one's RA = OA outflow only (no internal RA credit).
    if (age >= 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const actualTransferRA = oaToSaForLovedOne
        ? Math.min(annualOaToSa, oa)
        : (() => {
            const projERS_oaToRa = Math.round(projectedSum('ERS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
            const raRoom_oaToRa = Math.max(0, projERS_oaToRa - ra);
            return Math.min(annualOaToSa, oa, raRoom_oaToRa);
          })();
      oa -= actualTransferRA;
      if (!oaToSaForLovedOne) {
        ra += actualTransferRA;
        cumRaCashTopUps += actualTransferRA;
      } else {
        yearLovedOneOut += actualTransferRA;
        totalOutSpent += actualTransferRA;
      }
    }

    // OA→MA transfer: CPF policy requires age 55+, FRS or BRS+property already set aside.
    // For self: internal move OA→MA (both accounts change). For loved one: OA outflow only.
    if (age >= 55 && annualOaToMa > 0 && effOaToMaFreq > 0 && !isForeigner) { // B1: foreigners have no CPF
      const projBHS_tr = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
      const maRoom_tr = oaToMaForLovedOne ? annualOaToMa : Math.max(0, projBHS_tr - ma);
      const actualOaToMa = Math.min(annualOaToMa, oa, maRoom_tr);
      oa -= actualOaToMa;
      if (!oaToMaForLovedOne) {
        ma += actualOaToMa; // self: internal move
      } else {
        yearLovedOneOut += actualOaToMa; // loved one: tracked as outflow
        totalOutSpent += actualOaToMa;
      }
    }

    // Direct cash top-up to MA (freq-gated, any age, capped at BHS headroom, not Annual Limit)
    // maBeforeVcMa: saved here for MMSS eligibility check — policy assesses MA balance
    // before the current year's VCMA top-up (Issue 5 fix).
    const maBeforeVcMa = ma;
    if (vcMaCash * effVcMaFreq > 0 && !isForeigner) { // B1: foreigners cannot top up CPF
      const projBHS_vcma = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
      const maRoom_vcma = Math.max(0, projBHS_vcma - ma);
      const actualVcMa = Math.min(vcMaCash * effVcMaFreq, maRoom_vcma);
      ma += actualVcMa;
      yearInflow += actualVcMa;
      totalInjected += actualVcMa;
      yearVoluntary += actualVcMa;
    }

    // MMSS: auto-derived from vcMaCash × effVcMaFreq — no separate user-entered grant amount.
    // Fixes applied:
    //   Issue 2: simYear gate is now 2026–2030 (added lower bound — pilot starts 1 Jan 2026).
    //   Issue 3: grant is NOT credited immediately; stored in pendingMmssCarry and applied
    //            at the top of the NEXT loop iteration (CPF policy: credited start of following year).
    //   Issue 4: income gate enforced — employed uses owMonthly; SEP uses netTradeIncome/12.
    //   Issue 5: eligibility uses maBeforeVcMa (pre-VCMA balance), not the post-top-up ma.
    //            maRoom_mm still uses current (post-VCMA) ma for the headroom cap — correct,
    //            as the grant arrives next year when MA is at least at today's post-VCMA level.
    // N3 fix: clamp effectiveBaseYear to 2026 so legacy/imported profiles with a stale
    // currentYear < 2026 don't have their MMSS pilot window suppressed.  The MMSS scheme
    // launched in 2026; any simulation year computed from an earlier baseYear would fail
    // the >= 2026 gate even when the user is clearly projecting into 2026+ territory.
    const effectiveBaseYear_mmss = Math.max(MMSS_PILOT_START_YEAR, baseYear);
    const simYear_mmss = effectiveBaseYear_mmss + (age - startAge);
    // P1 fix: MMSS income gate must include AW/bonus in monthly gross, mirroring the MRSS N4 fix
    // (lines 1216-1219) and the MMSS UI badge (BUG-6 comment, lines 6154-6162).
    // gf_mmss is computed locally — this block runs outside the contribStop gate so the
    // top-level gf (line 979) is not yet in scope. salaryGrowth and salaryBump are pre-loop.
    // BUG-G fix: zero gf_mmss during retrenchment/career_break so mmssMonthlyIncome correctly
    // reflects $0 income during that year, preventing the <=4000 income gate from misfiring.
    // Note: mmssMonthlyIncome is also reused by the MRSS income gate (line ~1248) so this
    // fix simultaneously prevents incorrect MRSS credits during paused-contribution years.
    const gf_mmss             = leContribPaused ? 0 : computeGF(age, salaryBump);
    const owAnnualScaled_mmss = Math.min(owMonthly * 12 * gf_mmss, 96000);
    const awCeilingMmss       = Math.max(0, 102000 - owAnnualScaled_mmss);
    const bonusMmss           = Math.min((Number(inputs.salaryBonus) || 0) * gf_mmss, awCeilingMmss);
    const mmssMonthlyIncome   = isSEP
      ? (leContribPaused ? 0 : (Number(inputs.netTradeIncome) || 0) / 12) // E1 fix: zero income during retrenchment/career_break for SEP — prevents ≤$4k gate misfiring and incorrect MRSS credits at line ~1252
      : Math.round((owAnnualScaled_mmss + bonusMmss) / 12); // OW + AW/12; 0 post-retirement
    if (isSC && age >= 55 && age <= 70 &&
        simYear_mmss >= MMSS_PILOT_START_YEAR && simYear_mmss <= MMSS_PILOT_END_YEAR &&
        mmssMonthlyIncome <= 4000) {
      const projBHS_mm = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(simYear_mmss, bhsLockedYear) - 2026)));
      if (maBeforeVcMa < projBHS_mm / 2) { // Issue 5: pre-VCMA balance for eligibility
        const vcMaThis = vcMaCash * effVcMaFreq;
        if (vcMaThis > 0) {
          const maRoom_mm = Math.max(0, projBHS_mm - ma); // post-VCMA ma for headroom cap
          const actualMmss = Math.min(vcMaThis, 1000, maRoom_mm);
          // Issue 3: store in carry — credited to MA at start of following year, not immediately.
          // Issues 1/C2: yearInflow + totalInjected also updated then, in the carry block above.
          // NX6 fix: use += not = so back-to-back eligible years accumulate correctly
          // and future refactoring (e.g. moving the MMSS block) can't silently discard a prior carry
          if (actualMmss > 0) { pendingMmssCarry += actualMmss; }
        }
      }
    }

    // CPFIS — OA tranche: only OA savings ABOVE $20,000 are investible; age 18+ required.
    if (cpfisOaAmount * effCpfisOaFreq > 0 && age >= 18 && !isForeigner) { // B1: foreigners have no CPF
      const cpfisOaInvestible = Math.max(0, oa - 20000);
      const actualCpfisOa = Math.min(cpfisOaAmount * effCpfisOaFreq, cpfisOaInvestible);
      oa -= actualCpfisOa;
      yearCpfisOut += actualCpfisOa;
      totalOutSpent += actualCpfisOa;
    }
    // CPFIS — SA tranche: only SA savings ABOVE $40,000 are investible; SA is open pre-55 only; age 18+ required.
    // Post-55 SA is closed (merged to RA) so SA CPFIS is silently skipped after age 55.
    if (cpfisSaAmount * effCpfisSaFreq > 0 && age < 55 && age >= 18 && !isForeigner) { // B1: foreigners have no CPF
      const cpfisSaInvestible = Math.max(0, sa - 40000);
      const actualCpfisSa = Math.min(cpfisSaAmount * effCpfisSaFreq, cpfisSaInvestible);
      sa -= actualCpfisSa;
      yearCpfisOut += actualCpfisSa;
      totalOutSpent += actualCpfisSa;
    }

    // Rev #D2: leContribPaused (retrenchment/career_break) zeros gf like a career break.
    // leEarlyRetire treats this age as past contribStop — skip the entire contribution block.
    // C2 fix: also check earlyRetireFired so contributions stay blocked in all subsequent years.
    if (age < contribStop && !isForeigner && !leEarlyRetire && !earlyRetireFired) { // B1: foreigners have no CPF obligations
      const _baristaGfScale2 = leBaristaFire ? baristaScale : 1;
      const gf = leContribPaused ? 0 : computeGF(age, salaryBump) * _baristaGfScale2;
      // mandatorySA_base: used by SEP branch (always from user-entered baseSA_Emp).
      // Non-SEP branch computes its own mandatorySA_dyn below, which may come from
      // the PR G/G rate table when isPR && currentPrYear < 3.
      const mandatorySA_base = Math.round(baseSA_Emp * gf);

      if (isSEP) {
        // SEP VC3A: single cash lump-sum auto-split by age-band rates + VHR to OA
        // VHR is NOT subject to the Annual Limit — apply it straight to OA
        const nti = Number(inputs.netTradeIncome) || 0;
        let sepMandatoryMA = 0;
        if (nti > 6000) {
            // CPF Board's SEP MediSave Contribution Schedule is NTI-based and age-banded.
            // These rates apply equally to SC and all PR years — no separate PR G/G table
            // is published for SEP MA contributions. This is correct by policy design.
            let maRate = 0.08;
            if (age > 50) maRate = 0.105;
            else if (age > 45) maRate = 0.10;
            else if (age > 35) maRate = 0.09;
            sepMandatoryMA = Math.round(Math.min(nti, 96000) * maRate);
        }
        const vc3aTotal = Math.min(vc3aCash * effVc3aFreq, Math.max(0, ANNUAL_LIMIT - sepMandatoryMA)); // E1 fix: apply frequency/duration gate (mirrors employee branch line 1160)
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if (age <= 35) { vc3aOaRatio = 0.23; vc3aSaRatio = 0.06; vc3aMaRatio = 0.08; }
        else if (age <= 45) { vc3aOaRatio = 0.21; vc3aSaRatio = 0.07; vc3aMaRatio = 0.09; }
        else if (age <= 50) { vc3aOaRatio = 0.19; vc3aSaRatio = 0.08; vc3aMaRatio = 0.10; }
        else if (age <= 55) { vc3aOaRatio = 0.15; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 60) { vc3aOaRatio = 0.12;  vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 65) { vc3aOaRatio = 0.035; vc3aSaRatio = 0.11;  vc3aMaRatio = 0.105; }
        else if (age <= 70) { vc3aOaRatio = 0.01;  vc3aSaRatio = 0.05;  vc3aMaRatio = 0.105; }
        else               { vc3aOaRatio = 0.01;  vc3aSaRatio = 0.01;  vc3aMaRatio = 0.105; }
        const ratioSum = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        // VHR-FRS SEP (engine 2): separate VHR for FRS routing below
        const sepVhrAmt2 = vcVhrAmt * effVcVhrFreq;
        const toOA_vc3a  = Math.round(vc3aTotal * (vc3aOaRatio / ratioSum)); // VC3A OA only
        const toMA_vc3a  = Math.round(vc3aTotal * (vc3aMaRatio / ratioSum));
        const toSA_vc3a  = vc3aTotal - toOA_vc3a - toMA_vc3a;
        // WIS for SEP: 90% goes to MA (subject to BHS), 10% is cash (not modelled here)
        const wisToMA_sep = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.9) : 0;
        yearWisCash = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.1) : 0; // BUG-44: cash portion for display
        const projBHS_i = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
        const maRoom = Math.max(0, projBHS_i - ma);
        // B3 SEP: priority split — mandatory MA gets first claim on BHS room, vc3a MA gets remainder
        const actualMandatoryMA_sep = Math.min(sepMandatoryMA, maRoom);
        const vcMaRoomSep = Math.max(0, maRoom - actualMandatoryMA_sep);
        const actualVcMA_sep = Math.min(toMA_vc3a, vcMaRoomSep);
        // maSpill carries both mandatory overflow (if BHS already full) and vc3a MA overflow
        const maSpill = (sepMandatoryMA - actualMandatoryMA_sep) + (toMA_vc3a - actualVcMA_sep);
        // B2 SEP: WIS MA overflow — any WIS that can't fit in remaining BHS room spills to SA/RA
        const remainingMaRoom = Math.max(0, maRoom - actualMandatoryMA_sep - actualVcMA_sep);
        const actualToMAWis = Math.min(wisToMA_sep, remainingMaRoom);
        const wisMASpill = wisToMA_sep - actualToMAWis;   // B2: overflow routed below
        ma += (actualMandatoryMA_sep + actualVcMA_sep + actualToMAWis);
        // M3: projFRS_sep is shared by both age branches — identical formula, computed once
        const projFRS_sep = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        if (age >= 55) {
          // VC3A: RA cap is FRS (not ERS — ERS applies only to RSTU cash top-ups)
          const raRoom_sep = Math.max(0, projFRS_sep - ra);
          // B2: include wisMASpill in SA/RA routing alongside vc3a SA and maSpill
          const toRA_sep = Math.min(toSA_vc3a + maSpill + wisMASpill, raRoom_sep);
          ra += toRA_sep;
          oa += (toSA_vc3a + maSpill + wisMASpill - toRA_sep);
        } else {
          // MA spill to SA is capped at FRS — excess above FRS overflows to OA
          const saRoomSep = Math.max(0, projFRS_sep - sa);
          // B2: include wisMASpill in SA routing
          const toSA_total = toSA_vc3a + maSpill + wisMASpill;
          const actualToSA_sep = Math.min(toSA_total, saRoomSep);
          sa += actualToSA_sep;
          oa += (toSA_total - actualToSA_sep); // FRS overflow to OA
        }
        oa += toOA_vc3a;
        // VHR-FRS-FIX SEP (engine 2): route VHR to RA/SA first when below FRS
        if (sepVhrAmt2 > 0) {
          const yrOff_vs2 = Math.max(0, (baseYear + (age - startAge)) - 2026);
          const frs_vs2   = Math.round(projectedSum('FRS', rsGrowth, yrOff_vs2));
          if (age >= 55) {
            const raRm_vs2 = Math.max(0, frs_vs2 - ra);
            const toRA_vs2 = Math.min(sepVhrAmt2, raRm_vs2);
            ra += toRA_vs2; oa += (sepVhrAmt2 - toRA_vs2);
            if (toRA_vs2 > 0) cumRaCashTopUps += toRA_vs2;
          } else {
            const saRm_vs2 = Math.max(0, frs_vs2 - sa);
            const toSA_vs2 = Math.min(sepVhrAmt2, saRm_vs2);
            sa += toSA_vs2; oa += (sepVhrAmt2 - toSA_vs2);
          }
        }
        // MRSS eligibility: SC only · age >= 55 (or PwD) · RA/balance below BRS · income ≤ $4,000/mo · lifetime cap $20,000
        // Auto-derived: grant = min(RSTU top-up this year, $2,000, cap remaining). No separate user input.
        const projBRS_sep = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_sep = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_sep = age >= 55 ? ra < projBRS_sep : (oa + sa) < projBRS_sep;
        // Reuse mmssMonthlyIncome (computed above for MMSS) so both MRSS and MMSS
        // use the same single monthly-income source for the ≤$4,000 income gate.
        // For SEPs: mmssMonthlyIncome = NTI / 12 (same formula; AW not applicable).
        const mrssIncomeOk_sep = mmssMonthlyIncome <= 4000;
        // C4 fix: same overrideVcSA ternary as employed path — MRSS in SEP branch must
        // also respect the What-If slider rather than reading live inputs.vcSaTopup directly.
        const vcSaThis_sep = (overrideVcSA !== undefined ? overrideVcSA : (Number(inputs.vcSaTopup) || 0)) * effVcSaFreq;
        const mrssEligible_sep = isSC && mrssAgeOk_sep && mrssBalOk_sep && mrssIncomeOk_sep && cumMrssReceived < 20000 && vcSaThis_sep > 0;
        const actualMrss_sep = mrssEligible_sep ? Math.min(vcSaThis_sep, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_sep > 0) cumMrssReceived += actualMrss_sep;
        const govGrant_sep = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        if (age >= 55) { ra += govGrant_sep + actualMrss_sep; }
        else { sa += govGrant_sep + actualMrss_sep; }
        // B2: yearInflow and yearGovGrants now include WIS (wisToMA_sep = actualToMAWis + wisMASpill)
        // Fix: use a local variable for the contribution-phase inflow so that vcMaCash and
        // any MMSS carry already accumulated into yearInflow (before this block) are not
        // overwritten. yearInflow must be += (not =) to preserve those earlier additions.
        const sepContribInflow = vc3aTotal + vcVhrAmt * effVcVhrFreq + sepMandatoryMA + govGrant_sep + actualMrss_sep + wisToMA_sep; // E1 fix: VHR frequency-gated
        yearInflow += sepContribInflow;
        totalInjected += sepContribInflow;
        cumRaCashTopUps += toSA_vc3a + maSpill + wisMASpill + govGrant_sep + actualMrss_sep;
        // Cashflow ledger breakdown (SEP)
        yearMandatory += actualMandatoryMA_sep;          // B3: actual amount credited to MA, not nominal
        yearVoluntary += vc3aTotal + vcVhrAmt * effVcVhrFreq; // E1 fix: VHR frequency-gated
        yearGovGrants += govGrant_sep + actualMrss_sep + wisToMA_sep; // B2: WIS included
      } else {
        // Mandatory contribution calculation — three paths:
        // Path A. PR Yr1/2 (currentPrYear < 3): use advancing PR rate table applied to
        //    annualGrossSalary * gf (OW) + AW bonus portion. Bug fix: bonus was
        //    previously excluded, understating PR Yr1/2 contributions for members
        //    with a significant annual wage.
        // Path B. PR Yr3+ graduated from Yr1/2 (isPR && startPrYear < 3 && currentPrYear >= 3):
        //    use SC/PR3+ rates computed dynamically from gross salary. Bug fix: previously
        //    fell back to baseOA_Emp which held PR Yr1/2 values (~9–24%), silently
        //    understating contributions by the difference vs SC rates (~37%).
        // Path C. SC or PR3+ from start: use user-entered base fields scaled by gf (unchanged).
        let mandatoryOA_i, mandatorySA_dyn, mandatoryMA_i;
        if (isPR && currentPrYear < 3) {
          // Path A — PR Yr1/2: rate table × (OW + AW)
          // Fix 2: include AW (bonus) using the same awCeiling logic as Auto-Calc.
          // The bonus scales with gf (consistent with how SC path scales baseOA_Emp * gf,
          // which already bakes in the bonus at year 0).
          const prRates = getPRRates(currentPrYear, age, inputs.prRateType || 'GG');
          const grossScaled = annualGrossSalary * gf;
          // OW ceiling at $8k/mo already enforced in annualGrossSalary; scale with gf
          // but re-cap at $96k (8000×12) if salary growth pushes past ceiling.
          const owScaledCapped = Math.min(grossScaled, 96000);
          const awCeilingEng = Math.max(0, 102000 - owScaledCapped);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = owScaledCapped + bonusCpfEng;
          mandatoryOA_i  = Math.round(totalScaled * prRates.oa);
          mandatorySA_dyn = Math.round(totalScaled * prRates.sa);
          mandatoryMA_i  = Math.round(totalScaled * prRates.ma);
        } else if (isPR && startPrYear < 3) {
          // Path B — PR member graduated to Yr3+: compute SC/PR3+ rates dynamically.
          // Fix 1: previously used baseOA_Emp (PR Yr1/2 values) — now uses SC rate table.
          // OA/SA/MA rates mirror the SC/PR3+ (Table 1, 2026) age-band splits in Auto-Calc.
          const _bandB = scAllocBand(age, baseYear + (age - startAge));
          const scOA = _bandB.oa, scSA = _bandB.sa, scMA = _bandB.ma;
          const grossScaled = Math.min(annualGrossSalary * gf, 96000);
          const awCeilingEng = Math.max(0, 102000 - grossScaled);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = grossScaled + bonusCpfEng;
          mandatoryOA_i  = Math.round(totalScaled * scOA);
          mandatorySA_dyn = Math.round(totalScaled * scSA);
          mandatoryMA_i  = Math.round(totalScaled * scMA);
        } else {
          // Path C — user-entered contributions, rescaled to the age band in force this year
          // (2026 step-down at 55/60/65/70) and re-split by that band's OA/SA/MA allocation.
          const _bandStart = scAllocBand(startAge, baseYear), _bandNow = scAllocBand(age, baseYear + (age - startAge));
          const _cTotal = (baseOA_Emp + baseSA_Emp + baseMA_Emp) * gf * (_bandNow.total / _bandStart.total);
          mandatoryOA_i   = Math.round(_cTotal * _bandNow.oa / _bandNow.total);
          mandatorySA_dyn = Math.round(_cTotal * _bandNow.sa / _bandNow.total);
          mandatoryMA_i   = Math.round(_cTotal * _bandNow.ma / _bandNow.total);
          // P3-A fix: Paths A & B cap at OW/AW ceilings which implicitly cap below ANNUAL_LIMIT.
          // Path C (manual entries) has no such ceiling — growth factor (gf) can push totals past
          // $37,740/yr indefinitely. Proportionally scale down to ANNUAL_LIMIT if breached.
          const totalC = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
          if (totalC > ANNUAL_LIMIT) {
            const scaleC = ANNUAL_LIMIT / totalC;
            mandatoryOA_i   = Math.round(mandatoryOA_i   * scaleC);
            mandatorySA_dyn = Math.round(mandatorySA_dyn * scaleC);
            mandatoryMA_i   = ANNUAL_LIMIT - mandatoryOA_i - mandatorySA_dyn; // remainder prevents rounding gap
          }
        }
        // ── Secondary employment: stack contributions from second income (PE engine) ──
        const _secStop = Number(inputs.secondaryContribStopAge) || 65;
        if (_secEnabled && age < _secStop) {
          mandatoryOA_i   += Math.round(_secOA_base * gf);
          mandatorySA_dyn += Math.round(_secSA_base * gf);
          mandatoryMA_i   += Math.round(_secMA_base * gf);
        }
        // VC3A: single lump-sum auto-split by age-band rates + VHR to OA
        // WIS employees: 60% goes to CPF via age-band rates
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if (age <= 35) { vc3aOaRatio = 0.23; vc3aSaRatio = 0.06; vc3aMaRatio = 0.08; }
        else if (age <= 45) { vc3aOaRatio = 0.21; vc3aSaRatio = 0.07; vc3aMaRatio = 0.09; }
        else if (age <= 50) { vc3aOaRatio = 0.19; vc3aSaRatio = 0.08; vc3aMaRatio = 0.10; }
        else if (age <= 55) { vc3aOaRatio = 0.15; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 60) { vc3aOaRatio = 0.12; vc3aSaRatio = 0.115; vc3aMaRatio = 0.105; }
        else if (age <= 65) { vc3aOaRatio = 0.035; vc3aSaRatio = 0.11; vc3aMaRatio = 0.105; }
        else if (age <= 70) { vc3aOaRatio = 0.01; vc3aSaRatio = 0.05; vc3aMaRatio = 0.105; }
        else { vc3aOaRatio = 0.01; vc3aSaRatio = 0.01; vc3aMaRatio = 0.105; }
        const ratioSum_emp = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        // WIS: 60% of annual WIS amount goes to CPF via age-band split
        const wisCpf = wisAmount * effWisFreq > 0 ? Math.round(wisAmount * effWisFreq * 0.6) : 0;
        yearWisCash = Math.round(wisAmount * effWisFreq * 0.4); // BUG-44: cash portion (40%) for Data Table display
        const wisOA = Math.round(wisCpf * (vc3aOaRatio / ratioSum_emp));
        const wisMA = Math.round(wisCpf * (vc3aMaRatio / ratioSum_emp));
        const wisSA = wisCpf - wisOA - wisMA;
        // VC3A (cash only) split — freq-gated
        const vc3aCashEff = vc3aCash * effVc3aFreq;
        const vcVhrAmtEff = vcVhrAmt * effVcVhrFreq;
        const vc3aOA = Math.round(vc3aCashEff * (vc3aOaRatio / ratioSum_emp));
        const vc3aMA = Math.round(vc3aCashEff * (vc3aMaRatio / ratioSum_emp));
        const vc3aSA = vc3aCashEff - vc3aOA - vc3aMA;
        // Annual Limit: applies to mandatory + VC3A (WIS is govt, not counted in limit)
        const totalMandatory = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
        const vcRoomThisYear = Math.max(0, ANNUAL_LIMIT - totalMandatory);
        // Scale VC3A if it exceeds the room (VHR + RSTU handled separately outside limit)
        const vc3aScale = vc3aCashEff > 0 && vc3aCashEff > vcRoomThisYear ? vcRoomThisYear / vc3aCashEff : 1;
        // VHR-FRS-FIX: VHR removed from cappedVcOA — applied separately with FRS routing below
        const cappedVcOA = Math.round(vc3aOA * vc3aScale);
        const cappedVcSA = overrideVcSA !== undefined
          ? Math.round(overrideVcSA * vc3aScale) + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq
          : Math.round(vc3aSA * vc3aScale) + (Number(inputs.vcSaTopup) || 0) * effVcSaFreq + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        const cappedVcMA = Math.round(vc3aMA * vc3aScale);

        const totalOA = mandatoryOA_i + cappedVcOA + wisOA;
        // BHS cap on MA — B3: priority split so mandatory gets first claim, then vc3a MA, then WIS MA
        const projBHS_emp = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
        const maRoomEmp = Math.max(0, projBHS_emp - ma);
        const actualMandatoryMA_emp = Math.min(mandatoryMA_i, maRoomEmp);
        const vcMaRoomEmp = Math.max(0, maRoomEmp - actualMandatoryMA_emp);
        const actualVcMA_emp = Math.min(cappedVcMA, vcMaRoomEmp);
        const wisMARoom_emp = Math.max(0, vcMaRoomEmp - actualVcMA_emp);
        const actualWisMA_emp = Math.min(wisMA, wisMARoom_emp);
        const actualMA = actualMandatoryMA_emp + actualVcMA_emp + actualWisMA_emp;
        const rawMA = mandatoryMA_i + cappedVcMA + wisMA;  // retained for maSpillEmp
        const maSpillEmp = rawMA - actualMA;

        oa += totalOA;
        ma += actualMA;
        // Fix: use a local variable so yearInflow += (not =) preserves vcMaCash and
        // MMSS carry already accumulated into yearInflow before the contrib block.
        // BUG-02 fix: actualMrss_emp is computed below (line ~1181) but must be included
        // in empContribInflow so yearInflow and totalInjected are accurate.
        // FIX-maSpill (RSS engine): include maSpillEmp so MA contributions that overflow
        // BHS and redirect to SA/RA/OA are tracked in totalInjected (same fix as LIFE engine).
        const empContribInflowBase = totalOA + mandatorySA_dyn + cappedVcSA + actualMA + maSpillEmp + wisSA + vcVhrAmtEff; // VHR restored: removed from cappedVcOA, must reappear here for accurate yearInflow tracking
        // yearInflow and totalInjected updated below after actualMrss_emp is resolved.
        // Cashflow ledger breakdown (employed) — B3: use priority-split actuals, not Math.min on raw
        yearMandatory += mandatoryOA_i + mandatorySA_dyn + actualMandatoryMA_emp;
        // N5 fix: replace bare vcSaTopup term with (cappedVcSA - annualGovGrant).
        // cappedVcSA = vc3aSA*scale + vcSaTopup + annualGovGrant.  Previously only
        // vcSaTopup was credited here, leaving vc3aSA silently missing from yearVoluntary
        // (it flowed into yearInflow via cappedVcSA but never into any sub-ledger bucket).
        // annualGovGrant is correctly owned by yearGovGrants — subtract it to avoid overlap.
        const govGrantContrib_emp = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        yearVoluntary += cappedVcOA + (vc3aCashEff > 0 ? actualVcMA_emp : 0) + (cappedVcSA - govGrantContrib_emp) + vcVhrAmtEff;
        // MRSS eligibility: SC only · age >= 55 (or PwD) · RA/balance below BRS · income ≤ $4,000/mo · lifetime cap $20,000
        // Auto-derived: grant = min(RSTU top-up this year, $2,000, cap remaining). No separate user input.
        const projBRS_emp = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_emp = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_emp = age >= 55 ? ra < projBRS_emp : (oa + sa) < projBRS_emp;
        // N4 fix: MRSS income gate must use total gross monthly income (OW + AW/12), not OW alone.
        // A member earning $3,900/mo OW + $24,000 bonus has ~$5,900 effective monthly gross and
        // is ineligible. Mirror the AW ceiling logic used by the PR rate engine paths.
        const owAnnualScaled_mrss = Math.min(owMonthly * 12 * gf, 96000);
        const awCeilingMrss = Math.max(0, 102000 - owAnnualScaled_mrss);
        const bonusMrss = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingMrss);
        const mrssMonthlyGross_emp = Math.round((owAnnualScaled_mrss + bonusMrss) / 12);
        const mrssIncomeOk_emp = mrssMonthlyGross_emp <= 4000;
        // C4 fix: mirror the same overrideVcSA ternary used by cappedVcSA (line ~1355) so that
        // MRSS eligibility and grant size are computed against the What-If slider value, not live inputs.
        const vcSaThis_emp = (overrideVcSA !== undefined ? overrideVcSA : (Number(inputs.vcSaTopup) || 0)) * effVcSaFreq;
        const mrssEligible_emp = isSC && mrssAgeOk_emp && mrssBalOk_emp && mrssIncomeOk_emp && cumMrssReceived < 20000 && vcSaThis_emp > 0;
        const actualMrss_emp = mrssEligible_emp ? Math.min(vcSaThis_emp, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_emp > 0) cumMrssReceived += actualMrss_emp;
        yearGovGrants += (Number(inputs.annualGovGrant)||0) * effGovGrantFreq + actualMrss_emp + wisCpf * effWisFreq;
        // BUG-02 fix: include actualMrss_emp in empContribInflow so yearInflow/totalInjected are accurate.
        // MRSS is a government grant that flows into RA — it is a real inflow to the member's CPF.
        const empContribInflow = empContribInflowBase + actualMrss_emp;
        yearInflow += empContribInflow;
        totalInjected += empContribInflow;

        if (age >= 55) {
          let roomInRA_Mand = Math.max(0, cohortRetSum - ra);
          let mandToRA = Math.min(mandatorySA_dyn, roomInRA_Mand);
          ra += mandToRA;
          oa += (mandatorySA_dyn - mandToRA);
          // VC3A: RA cap is FRS (not ERS — ERS applies only to RSTU cash top-ups)
          const projFRS_vc3a_emp = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          const vcRoomInRA = Math.max(0, projFRS_vc3a_emp - ra);
          const vcToRA = Math.min(cappedVcSA + maSpillEmp + wisSA, vcRoomInRA);
          ra += vcToRA;
          oa += (cappedVcSA + maSpillEmp + wisSA - vcToRA);
          ra += actualMrss_emp;
          cumRaCashTopUps += vcToRA + actualMrss_emp;
        } else {
          // MA spill to SA is capped at FRS — excess above FRS overflows to OA
          const projFRS_sa = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          // Mandatory contributions always go to the SA: the Full Retirement Sum limits
          // top-ups, transfers and MediSave overflow, not contributions from wages (CPF Board).
          sa += mandatorySA_dyn;
          const cappedToSA = cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
          const saRoom = Math.max(0, projFRS_sa - sa);
          const actualToSA = Math.min(cappedToSA, saRoom);
          const saOverflow = cappedToSA - actualToSA;
          sa += actualToSA;
          oa += saOverflow; // voluntary / overflow amounts above the FRS go to OA
          cumRaCashTopUps += cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
        }

        // ── VHR: Housing Refund — route to RA/SA before OA when below FRS ─────
        if (vcVhrAmtEff > 0) {
          const yrOffsetVhr2 = Math.max(0, (baseYear + (age - startAge)) - 2026);
          const projFRS_vhr2  = Math.round(projectedSum('FRS', rsGrowth, yrOffsetVhr2));
          if (age >= 55) {
            const raRoomVhr2 = Math.max(0, projFRS_vhr2 - ra);
            const vhrToRA2   = Math.min(vcVhrAmtEff, raRoomVhr2);
            ra += vhrToRA2; oa += (vcVhrAmtEff - vhrToRA2);
            if (vhrToRA2 > 0) cumRaCashTopUps += vhrToRA2;
          } else {
            const saRoomVhr2 = Math.max(0, projFRS_vhr2 - sa);
            const vhrToSA2   = Math.min(vcVhrAmtEff, saRoomVhr2);
            sa += vhrToSA2; oa += (vcVhrAmtEff - vhrToSA2);
          }
        }
      }
    }

    // ── Post-contribStop RSTU (vcSaTopup): not gated by contribution stop ────────
    // CPF policy: voluntary RSTU cash top-ups to SA/RA are permitted at any age,
    // regardless of employment status or whether mandatory contributions have ceased.
    // vcMaCash is already handled unconditionally above — no change needed there.
    // NOTE: vc3aScale is deliberately NOT applied here — RSTU sits outside the CPF
    // Annual Limit and must not be multiplied by the VC3A pro-rata scale factor.
    if (!isForeigner && age >= contribStop) {
      const vcSaAmt = (overrideVcSA !== undefined ? overrideVcSA : (Number(inputs.vcSaTopup) || 0)) * effVcSaFreq;
      if (vcSaAmt > 0) {
        const yrOffset = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projERS_rstu = Math.round(RETIREMENT_SUMS_2026.FRS * 2 * Math.pow(1 + rsGrowth, yrOffset));
        let actualVcSa = 0;
        if (age >= 55) {
          const raRoom = Math.max(0, projERS_rstu - ra);
          actualVcSa = Math.min(vcSaAmt, raRoom);
          // MRSS eligibility: SC-only, check RA BEFORE top-up, income ≤ $4k, lifetime cap $20k
          // BUG-4 fix: direct BRS projection — ERS/4 was arithmetically equivalent but fragile.
          const projBRS_rstu = Math.round(projectedSum('BRS', rsGrowth, yrOffset));
          // BUG-3 fix: PwD is a bypass for the under-55 requirement only — must include age < 55.
          const mrssAgeOk = age >= 55 || (isPwD && age < 55);
          const mrssEligible = isSC && mrssAgeOk && ra < projBRS_rstu && mmssMonthlyIncome <= 4000 && cumMrssReceived < 20000 && actualVcSa > 0;
          ra += actualVcSa;
          cumRaCashTopUps += actualVcSa;
          if (mrssEligible) {
            const mrssAmt = Math.min(actualVcSa, 2000, 20000 - cumMrssReceived);
            ra += mrssAmt; cumMrssReceived += mrssAmt; cumRaCashTopUps += mrssAmt;
            yearGovGrants += mrssAmt; yearInflow += mrssAmt; totalInjected += mrssAmt;
          }
        } else {
          // Pre-55 with contribStop < 55 (e.g. early retiree) — top up SA, capped at FRS
          const projFRS_rstu = Math.round(projERS_rstu / 2);
          const saRoom = Math.max(0, projFRS_rstu - sa);
          actualVcSa = Math.min(vcSaAmt, saRoom);
          sa += actualVcSa;
          cumRaCashTopUps += actualVcSa;
        }
        if (actualVcSa > 0) {
          yearVoluntary += actualVcSa;
          yearInflow += actualVcSa;
          totalInjected += actualVcSa;
        }
      }
    }

    // Interest (annual rates, randomised ±1% in Monte Carlo mode)
    // Rev #MC: variance band sourced from mcVariance parameter (in %). Inflation noise is half the rate noise.
    const _band = (mcVariance / 100);
    const _rand = rng ?? Math.random;
    const rateNoise = randomiseRates ? (_rand() * _band * 2 - _band) : 0;
    const inflNoise = randomiseRates ? (_rand() * _band - _band / 2) : 0; // ±half-band inflation variance
    const rOA = CPF_RATES.OA + rateNoise;
    const rSA = CPF_RATES.SA + rateNoise;
    const rMA = CPF_RATES.MA + rateNoise;
    const rRA = CPF_RATES.RA + rateNoise;
    // ENG-2 fix: effectiveInflation removed — was declared here but never read downstream.

    // ── Interest: mid-year (June) average-balance convention ──────────────────
    // Base = (opening + post-inflow-and-outflow closing) / 2
    // This gives each inflow ~6 months of interest and each outflow ~6 months
    // of lost interest, matching CPF's own simplified annual projection method.
    const oaAvg = (oaOpen + oa) / 2;
    const saAvg = (saOpen + sa) / 2;
    const maAvg = (maOpen + ma) / 2;
    const raAvg = (raOpen + ra) / 2;
    // ── Extra interest: correct CPF priority order and credit destinations ────
    // Pre-55  (+1% on first $60K): OA* first (cap $20K) → SA → MA
    //   OA's extra credited to SA; SA's extra to SA; MA's extra stays in MA.
    // Post-55 (+1% on first $60K AND +1% on first $30K): RA → OA* (cap $20K) → MA
    //   OA's extra credited to RA (not to OA itself); MA's extra stays in MA.
    // Source: CPF Board interest priority tables (Images 1–4 reviewed Apr 2025).
    let b1ToSA = 0, b1ToMA = 0, b1ToRA = 0;  // extra 1% ($60K pool) credit splits
    let b2ToRA = 0, b2ToMA = 0;               // extra 2nd 1% ($30K pool) credit splits
    if (age < 55) {
      // Pre-55 pool: OA* (cap $20K) → SA → MA
      const oaP1 = Math.min(oaAvg, 20000);
      const rem1 = Math.max(0, 60000 - oaP1);
      const saP1 = Math.min(saAvg, rem1);
      const maP1 = Math.min(maAvg, Math.max(0, rem1 - saP1));
      b1ToSA = (oaP1 + saP1) * CPF_RATES.EXTRA_1;  // OA & SA extra → SA
      b1ToMA = maP1 * CPF_RATES.EXTRA_1;             // MA extra stays in MA
    } else {
      // Post-55 extra 1% ($60K pool): RA → OA* (cap $20K) → MA
      const raP1 = Math.min(raAvg, 60000);
      const rem1 = Math.max(0, 60000 - raP1);
      const oaP1 = Math.min(oaAvg, Math.min(20000, rem1));
      const maP1 = Math.min(maAvg, Math.max(0, rem1 - oaP1));
      b1ToRA = (raP1 + oaP1) * CPF_RATES.EXTRA_1;   // RA & OA extra → RA
      b1ToMA = maP1 * CPF_RATES.EXTRA_1;              // MA extra stays in MA
      // Post-55 extra 2nd 1% ($30K pool): RA → OA* (cap $20K) → MA
      const raP2 = Math.min(raAvg, 30000);
      const rem2 = Math.max(0, 30000 - raP2);
      const oaP2 = Math.min(oaAvg, Math.min(20000, rem2));
      const maP2 = Math.min(maAvg, Math.max(0, rem2 - oaP2));
      b2ToRA = (raP2 + oaP2) * CPF_RATES.EXTRA_2;   // RA & OA extra → RA
      b2ToMA = maP2 * CPF_RATES.EXTRA_2;              // MA extra stays in MA
    }
    const b1 = b1ToSA + b1ToMA + b1ToRA;
    const b2 = b2ToRA + b2ToMA;
    // D4 Phase 2: scale first-year interest to actual months remaining until next birthday.
    const yearFraction = (age === startAge) ? firstYearFraction : 1.0;
    const yearTotalInterest = ((oaAvg * rOA) + (saAvg * rSA) + (maAvg * rMA) + (raAvg * rRA) + b1 + b2) * yearFraction;
    totalInterest += yearTotalInterest;
    // Per-account interest for cashflow ledger — MA extra now correctly attributed to MA column
    yearOaInterest = Math.round(oaAvg * rOA * yearFraction);
    yearMaInterest = Math.round((maAvg * rMA + b1ToMA + b2ToMA) * yearFraction);
    yearSaRaInterest = Math.round(yearTotalInterest) - yearOaInterest - yearMaInterest;
    // Track interest accruing to SA (pre-55) or RA (post-55) for 20% transfer base
    const yearRaInterest = (age >= 55
      ? (raAvg * rRA) + b1ToRA + b2ToRA    // post-55: RA base + RA/OA pool extras → RA
      : (saAvg * rSA) + b1ToSA             // pre-55:  SA base + OA/SA pool extras → SA
    ) * yearFraction;
    cumRaInterest += yearRaInterest;

    oa += oaAvg * rOA * yearFraction;
    sa += saAvg * rSA * yearFraction;
    ra += raAvg * rRA * yearFraction;
    ma += maAvg * rMA * yearFraction;
    // Apply extra interest to the correct accounts (MA's share stays in MA, not SA/RA)
    if (age < 55) { sa += b1ToSA * yearFraction; ma += b1ToMA * yearFraction; }
    else           { ra += (b1ToRA + b2ToRA) * yearFraction; ma += (b1ToMA + b2ToMA) * yearFraction; }
    if (age >= 55 && sa > 0) { ra += sa; sa = 0; } // B6: SA is closed from 55 — interest accrued before closure is credited to RA

    // Outflows — housing: CPF mortgage debits OA; Cash mortgage debits private assets
    const activeHousing = age < housingStop ? baseHousing * effHousingFreq : 0;
    if (activeHousing > 0) {
      yearHousingOut = activeHousing;
      if (inputs.mortgagePaymentSource === 'cash') {
        privateAssets = Math.max(0, privateAssets - activeHousing);
      } else {
        cumHousingOA += activeHousing;
        cumHousingFV = (cumHousingFV + activeHousing) * 1.025;
        oa = Math.max(0, oa - activeHousing);
      }
    } else if (inputs.mortgagePaymentSource !== 'cash') {
      // No housing withdrawal — compound prior cumHousingFV at 2.5%/yr
      cumHousingFV = cumHousingFV * 1.025;
    }

    // DPS — Dependants' Protection Scheme: annual OA deduction (SA/RA fallback), SC/PR only, age 21–64
    // auto: use getDpsPremiumForAge(age) so premium steps up correctly as member ages each year
    if (!isForeigner && age >= 21 && age < 65 && _dpsModePE !== 'optout') {
      const dpsPremPE = _dpsModePE === 'auto' ? getDpsPremiumForAge(age) : (Number(inputs.dpsAnnualPremium) || 0);
      if (dpsPremPE > 0) {
        const fromOA = Math.min(oa, dpsPremPE); oa -= fromOA;
        const rem = dpsPremPE - fromOA;
        if (rem > 0) { if (age < 55) sa = Math.max(0, sa - rem); else ra = Math.max(0, ra - rem); }
      }
    }
    // HPS — Home Protection Scheme: annual OA deduction, SC/PR only, ends at min(65, housingStop)
    if (!isForeigner && _hpsAnnualPE > 0 && age < Math.min(65, housingStop)) {
      oa = Math.max(0, oa - _hpsAnnualPE);
    }
    // #3 Property CPF refund: at sell age, refund principal + 2.5% accrued interest to OA
    if (sellPropertyAge > 0 && age === sellPropertyAge && !refundApplied) {
      // cumHousingFV = FV of all OA housing withdrawals compounded at 2.5%/yr per withdrawal date.
      // This correctly compounds each withdrawal from its own year — no lump-sum assumption.
      // Accrued interest = cumHousingFV - cumHousingOA (principal).
      const totalRefund = Math.round(cumHousingFV);
      // Step 1: Full refund credited to OA
      oa += totalRefund;
      yearInflow += totalRefund;
      totalInjected += totalRefund;
      yearVoluntary += totalRefund; // P1-B fix: classify in ledger so CSV sub-bucket math balances
      // Step 2: If property pledge was active, restore RA to FRS from OA
      // (pledge reduced RA to BRS at 55 — sale reverses this benefit up to FRS)
      if (usePropertyPledge) {
        const yrsSince2026 = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projFRSNow = Math.round(projectedSum('FRS', rsGrowth, yrsSince2026));
        const raHeadroom = Math.max(0, projFRSNow - ra);
        const transferToRA = Math.min(raHeadroom, oa);
        if (transferToRA > 0) {
          oa -= transferToRA;
          ra += transferToRA;
          // P1-E fix: do NOT tag as cumRaCashTopUps — this is a mandatory CPF pledge restoration,
          // not a voluntary top-up. Tagging it was incorrectly shielding these funds from the
          // 20% RA-to-OA transfer at payout age (raTransferBase was understated).
        }
        // Surplus above FRS stays in OA — ERS top-up is always optional
      }
      // Step 3: Property value removed from net worth (sold)
      currentPropValue = 0;
      refundApplied = true;
    }
    // Medical outflow — CareShield Life (elderCareShieldAmt) only begins at age 30 per MOH policy
    const yrSince = Math.max(0, age - startAge);
    const totalMaOut = Math.round((baseMedical + (age >= 30 ? elderCareShieldAmt : 0)) * Math.pow(1 + medInfl, yrSince));
    ma = Math.max(0, ma - totalMaOut);
    yearMedOut = totalMaOut;
    const yearTotalOut = activeHousing + totalMaOut;
    totalOutSpent += yearTotalOut;

    // OA Drawdown — post-payout supplementary income drawn from OA
    if (oaDrawdownActive && age >= oaDrawdownStartAge) {
      const availableToDraw = Math.max(0, oa - oaDrawdownFloor);
      const actualDraw = Math.min(oaDrawdownAnnual, availableToDraw);
      oa = Math.max(oaDrawdownFloor, oa - actualDraw);
      yearOaDrawOut = actualDraw;
      totalOutSpent += actualDraw; // tracked as outflow (cash leaving CPF to member)
    }

    // D1: OA Education Loan Scheme — withdraws from OA (CPF Board Education Loan Scheme)
    // Policy: up to 40% of accumulated OA (excluding housing principal already withdrawn).
    //   Accurate cap = 40% of (oa + cumHousingOA) less housing already used, simplified to
    //   40% of current OA balance each year — housing is already deducted from oa above.
    // Age 55+ rule: FRS must be set aside in RA before OA can be used for education.
    // Interest at 2.5%/yr accrues on withdrawn amount immediately (same rate as OA).
    //   From the lender's projection perspective this is a pure OA outflow — cash repayment
    //   back to OA is not modelled here (repayment occurs externally in cash).
    if (oaEduLoanAnnual > 0) {
      const effEduFreq = oaEduLoanFreq === 'one-time' && !isFirstYear ? 0 : (oaEduLoanDur > 0 && yearIdx >= oaEduLoanDur) ? 0 : 1;
      if (effEduFreq > 0) {
        const yrsSince2026_edu = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projFRS_edu = Math.round(projectedSum('FRS', rsGrowth, yrsSince2026_edu));
        // Age 55+ FRS gate: skip if RA hasn't met FRS yet
        const frsBlocked = age >= 55 && ra < projFRS_edu;
        if (!frsBlocked) {
          // P3-B fix: CPF policy anchors the 40% cap to *accumulated historical* OA
          // (current balance + prior education withdrawals), not just the shrinking current balance.
          // Old: eduCap = oa * 0.40  (recalculates against ever-smaller oa each year — too restrictive)
          // New: eduCap = (oa + cumEduOut) * 0.40 - cumEduOut  (preserves correct policy headroom)
          const eduCap = Math.max(0, (oa + cumEduOut) * 0.40 - cumEduOut);
          const actualEduLoan = Math.min(oaEduLoanAnnual * effEduFreq, eduCap, oa);
          oa = Math.max(0, oa - actualEduLoan);
          cumEduOut += actualEduLoan; // update cumulative tracker
          yearEduOut = actualEduLoan;
          totalOutSpent += actualEduLoan;
        }
      }
    }

    // Property Monetisation — one-time event (downgrade / LBS / Silver Housing Bonus)
    if (propMonetiseEnabled && age === propMonetiseAge && !propMonetiseApplied) {
      // Cash proceeds credited to private assets (member's bank account)
      privateAssets += propMonetiseCash;
      // RA top-up (e.g. Silver Housing Bonus CPF component, or LBS annuity lump-sum to RA)
      if (propMonetiseRaTopup > 0 && !isForeigner) { // B1: foreigners have no RA — RA top-up silently skipped; cash proceeds still flow to privateAssets above
        ra += propMonetiseRaTopup;
        cumRaCashTopUps += propMonetiseRaTopup;
        yearInflow += propMonetiseRaTopup;
        totalInjected += propMonetiseRaTopup;
        yearVoluntary += propMonetiseRaTopup; // P1-C fix: classify in ledger so sub-bucket sum matches yearInflow
      }
      // Property value reduced to reflect downgrade / LBS (approximate: remove proceeds from property value)
      currentPropValue = Math.max(0, currentPropValue - propMonetiseCash - propMonetiseRaTopup);
      propMonetiseApplied = true;
    }
    // LBS ongoing monthly payout — HDB pays from propMonetiseAge until lbsPayoutEndAge
    if (_lbsMonthlyPE > 0 && age >= propMonetiseAge && age <= _lbsEndAgePE) {
      const lbsAnnual = _lbsMonthlyPE * 12;
      privateAssets += lbsAnnual; yearInflow += lbsAnnual; totalInjected += lbsAnnual;
    }
    // Rental income — recurring cash inflow from property rental
    if (_rentalMonthlyPE > 0 && _rentalStartPE > 0 && age >= _rentalStartPE && age <= _rentalEndPE) {
      const rentalAnnual = _rentalMonthlyPE * 12;
      privateAssets += rentalAnnual; yearInflow += rentalAnnual; totalInjected += rentalAnnual;
    }
    // Rent expense — recurring private cash outflow (tenant paying rent)
    if (_rentExpMonthlyPE > 0 && _rentExpStartPE > 0 && age >= _rentExpStartPE && age <= _rentExpEndPE) {
      const rentExpAnnual = _rentExpMonthlyPE * 12;
      privateAssets -= rentExpAnnual; yearRentExpOut += rentExpAnnual; totalOutSpent += rentExpAnnual;
    }

    // B1: Property value — Bala Curve model (mirrors runRSSEngine). freeholdEquiv2 is
    // the freehold-equivalent anchor computed at projection start (above).
    // REM-3 fix retained: skip update after refundApplied to avoid stale leaseRemaining.
    if (!refundApplied) {
      leaseRemaining = Math.max(0, totalLease - yrSince);
      if (isLeasehold) {
        const mktFactor = Math.pow(1 + propGrowth, yrSince + 1);
        currentPropValue = Math.max(0, Math.round(freeholdEquiv2 * mktFactor * balaRatio(leaseRemaining)));
      } else {
        currentPropValue = Math.max(0, Math.round(currentPropValue * (1 + propGrowth)));
      }
    }

    // PR tenure advancement: each projection year advances the PR rate tier by 1,
    // capped at 3 (full SC/PR3+ rates). Has no effect for SC members (isPR = false).
    if (isPR && currentPrYear < 3) currentPrYear++;

    // ── Rev #D2: Life event effects applied after all other calculations ─────
    // 1. Medical crisis — annual outflow per drawSource
    for (const ev of leMedicalEvents) {
      const amt = Number(ev.magnitude) || 0;
      if (amt <= 0) continue;
      const src = ev.drawSource || 'oa_then_private';
      let actualOut = 0;
      if (src === 'oa') {
        const fromOA = Math.min(amt, Math.max(0, oa));
        oa = Math.max(0, oa - fromOA);
        actualOut = fromOA;
      } else if (src === 'private') {
        const fromPriv = Math.min(amt, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - fromPriv);
        actualOut = fromPriv;
      } else { // oa_then_private (default)
        const fromOA = Math.min(amt, Math.max(0, oa));
        oa = Math.max(0, oa - fromOA);
        const remainder = amt - fromOA;
        const fromPriv = Math.min(remainder, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - fromPriv);
        actualOut = fromOA + fromPriv;
      }
      yearEventsOut += actualOut;
      totalOutSpent += actualOut;
    }
    // 2. Windfall — one-off inflow fires only at startAge
    for (const ev of leWindfallEvents) {
      const amt = Number(ev.magnitude) || 0;
      if (amt <= 0) continue;
      const dest = ev.destination || 'private';
      // C1 fix: use the actual credited amount (not raw amt) for accounting so that
      // capped OA/SRS windfalls don't inflate yearEventsIn / yearInflow / totalInjected.
      let actualCredited = 0;
      if (dest === 'private') {
        privateAssets += amt;
        actualCredited = amt; // private has no cap — full amount is credited
      } else if (dest === 'oa') {
        // Respect Annual Limit: only credit up to remaining VC room
        const annualLimitRoom = Math.max(0, ANNUAL_LIMIT - (yearMandatory + yearVoluntary));
        const actualOA = Math.min(amt, annualLimitRoom);
        oa += actualOA;
        yearVoluntary += actualOA;
        actualCredited = actualOA; // excess above Annual Limit is not credited
      } else if (dest === 'srs') {
        // Respect SRS annual cap ($15,300 SC/PR, $35,700 foreigner)
        const srsCapAmt = srsCap; // M3 fix: srsCap already computed at engine-level (line ~762) — was re-derived redundantly
        const actualSRS = Math.min(amt, srsCapAmt);
        srsBalance += actualSRS;
        actualCredited = actualSRS; // excess above SRS cap is not credited
      }
      yearEventsIn  += actualCredited;
      yearInflow    += actualCredited;
      totalInjected += actualCredited;
    }
    // 3a. New event types — same logic as main engine (gap-analysis pass)
    if (leMarriageEvent) {
      const grantAmt = Number(leMarriageEvent.magnitude) || 0;
      if (grantAmt > 0 && !isForeigner) { oa += grantAmt; yearEventsIn += grantAmt; yearInflow += grantAmt; totalInjected += grantAmt; }
    }
    if (leChildBirth) {
      const babyBonus = Number(leChildBirth.magnitude) || 0;
      if (babyBonus > 0) { privateAssets += babyBonus; yearEventsIn += babyBonus; yearInflow += babyBonus; totalInjected += babyBonus; }
    }
    for (const ev of leLoanEvents) {
      const annualRep = (Number(ev.magnitude) || 0) * 12;
      if (annualRep <= 0) continue;
      const actual = Math.min(annualRep, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual); yearEventsOut += actual; totalOutSpent += actual;
    }
    for (const ev of leParentSupport) {
      const annualAmt = (Number(ev.magnitude) || 0) * 12;
      if (annualAmt <= 0) continue;
      const actual = Math.min(annualAmt, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual); yearEventsOut += actual; totalOutSpent += actual;
    }
    for (const ev of leEducation) {
      const annualCost = Number(ev.magnitude) || 0; if (annualCost <= 0) continue;
      const actual = Math.min(annualCost, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual); yearEventsOut += actual; totalOutSpent += actual;
    }
    for (const ev of leDonation) {
      const annualDon = Number(ev.magnitude) || 0; if (annualDon <= 0) continue;
      const actual = Math.min(annualDon, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual); yearEventsOut += actual; totalOutSpent += actual;
      const donRate = (Number(inputs.budgetTaxRate) || 0) / 100;
      if (donRate > 0) { const saving = Math.round(Math.min(annualDon, annualGrossSalary) * 2.5 * donRate); privateAssets += saving; yearEventsIn += saving; yearInflow += saving; totalInjected += saving; }
    }
    const _loanMonthlyRSS = Number(inputs.loanMonthlyRepayment) || 0;
    if (_loanMonthlyRSS > 0 && age <= (Number(inputs.loanEndAge) || 55)) {
      const al = Math.min(_loanMonthlyRSS * 12, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - al); yearEventsOut += al; totalOutSpent += al;
    }
    const _parentMonthlyRSS = Number(inputs.parentSupportMonthly) || 0;
    if (_parentMonthlyRSS > 0 && age <= (Number(inputs.parentSupportEndAge) || 75)) {
      const ap = Math.min(_parentMonthlyRSS * 12, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - ap); yearEventsOut += ap; totalOutSpent += ap;
    }
    const _marriageAgeRSS = Number(inputs.marriageAge) || 0;
    const _housingGrantRSS = Number(inputs.housingGrantAmount) || 0;
    if (_marriageAgeRSS > 0 && age === _marriageAgeRSS && _housingGrantRSS > 0 && !isForeigner && !leMarriageEvent) {
      oa += _housingGrantRSS; yearEventsIn += _housingGrantRSS; yearInflow += _housingGrantRSS; totalInjected += _housingGrantRSS;
    }
    for (const child of (inputs.childrenData || [])) {
      const cs = Number(child.startAge) || 0; const ce = Number(child.endAge) || 0; const cc = Number(child.annualCost) || 0;
      if (cs > 0 && ce > 0 && cc > 0 && age >= cs && age <= ce) {
        const acRSS = Math.min(cc, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - acRSS); yearEventsOut += acRSS; totalOutSpent += acRSS;
      }
    }
    // 3. Hyperinflation — no balance effect; magnitude stored in projection row for UI use
    // (purchasing-power / real-dollar display uses inflationRate; override surfaced in row below)

    data.push({
      age,
      oa: Math.round(oa), sa: Math.round(sa),
      ma: Math.round(ma), ra: Math.round(ra),
      raStart: Math.round(raOpen), // RA on the birthday that starts this age year (see raAtPayoutStart)
      total: Math.round(oa + sa + ma + ra),
      propertyValue: Math.round(currentPropValue),
      privateAssets: Math.round(privateAssets),
      srsBalance: Math.round(srsBalance),
      interest: Math.round(yearTotalInterest),
      injected: Math.round(yearInflow),
      outflow: Math.round(yearHousingOut + yearMedOut + yearOaDrawOut + yearCpfisOut + yearEduOut + yearLovedOneOut + yearEventsOut + yearRentExpOut),
      cumulativeInjected: Math.round(totalInjected),
      cumulativeInterest: Math.round(totalInterest),
      cumulativeOutflow: Math.round(totalOutSpent),
      cumRaCashTopUps: Math.round(cumRaCashTopUps),
      cumRaInterest: Math.round(cumRaInterest),
      // Cashflow ledger breakdown fields
      yearMandatory: Math.round(yearMandatory),
      yearVoluntary: Math.round(yearVoluntary),
      yearGovGrants: Math.round(yearGovGrants),
      yearOaInterest, yearSaRaInterest, yearMaInterest,
      yearHousingOut: Math.round(yearHousingOut),
      yearMedOut: Math.round(yearMedOut),
      yearOaDrawOut: Math.round(yearOaDrawOut),
      yearLovedOneOut: Math.round(yearLovedOneOut),
      yearCpfisOut: Math.round(yearCpfisOut),
      yearEduOut: Math.round(yearEduOut),
      yearRentExpOut: Math.round(yearRentExpOut),
      yearEventsIn:  Math.round(yearEventsIn),   // Rev #D2: windfall inflows
      yearEventsOut: Math.round(yearEventsOut),  // Rev #D2: medical crisis outflows
      yearPrivDrawOut: Math.round(yearPrivDrawOut), // P1-D: private asset DWZ drawdown this year
      yearWisCash: Math.round(yearWisCash),          // BUG-44: WIS cash portion (not CPF) for Data Table display
      cumHousingFV: Math.round(cumHousingFV),        // ENG-1: exact FV of all OA housing withdrawals compounded at 2.5%/yr per-withdrawal — used in milestone alert
      // Rev #D2: active life event types this year (for chart marker rendering)
      activeEventTypes: activeEvents.map(e => e.type),
      activeHyperinflation: leHyperinflation ? Number(leHyperinflation.magnitude) || 0 : 0,
    });
  }
  return data;
}
