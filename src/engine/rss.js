/**
 * Retirement Sum Scheme (RSS) projection engine — members born before 1958.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */
import { _cpfEngineInit, balaRatio, makeComputeGF } from './common.js';
import { ANNUAL_LIMIT, CPF_RATES, MMSS_PILOT_END_YEAR, MMSS_PILOT_START_YEAR, RETIREMENT_SUMS_2026, projectedSum, getDpsPremiumForAge, getPRRates, scAllocBand, scEmployeeRate } from '../policy/cpf2026.js';
import { computeBasicPlanParams, computeBasicPlanYearPayout, interpolateCpfLife } from './cpfLife.js';

export function runRSSEngine(inputs, {
  overrideContribStop,
  overrideVcSA,
  overrideHousingOutflow,
  overrideSalaryBump,
  overridePrivDrawdown,
  overridePrivDrawdownStart,
  overrideOaDrawdownMonthly,
  overrideSrsContrib,
  overridePrivGrowthRate,
  maxAge = 95,          // F1: configurable horizon (95/100/105)
  randomiseRates = false,
  mcVariance = 1,
  rng = null,           // Seeded PRNG — pass seededRandom(seed)() for deterministic MC
} = {}) {
  // These are the only additions vs runProjectionEngine setup.
  const rssPayoutStart  = Number(inputs.rssPayoutStartAge) || 65;
  const rssMonthly      = Number(inputs.rssMonthlyPayout)  || 0;
  const rssAnnualPayout = rssMonthly * 12;
  let   rssDepletionAge = null;   // set once, when ra first hits 0
  let   rssDepletionHit = false;  // persistent guard so depletion is only recorded once
  // ── CPF LIFE migration (PR-3) ────────────────────────────────────────────────
  const migrationAge       = Math.max(0, Number(inputs.lifeMigrationAge) || 0);
  // lifePlanKey: which CPF LIFE plan the member chooses at migration.
  // 'std' = Standard (fixed for life), 'esc' = Escalating (2%/yr), 'bas' = Basic (two-phase).
  const lifePlanKey        = (['std','esc','bas'].includes(inputs.lifePlanAtMigration))
                               ? inputs.lifePlanAtMigration : 'std';
  const isMaleRSS          = inputs.isMale !== false;
  let   migrationActivated = false;  // flips true on the year age === migrationAge
  let   postMigrationMonthly = 0;   // CPF LIFE monthly payout at migration age (plan-specific)
  let   migYearsSince      = 0;     // escalating plan: years elapsed since migration (for 2%/yr compounding)
  // CPF LIFE Basic Plan state variables — used post-migration when lifePlanKey === 'bas'.
  let   migRaRem           = 0;     // RA_Retained tracker for Basic Plan post-migration
  let   migPhase1bTrigger  = 0;
  let   migPhase1bActualTrigger = 0; // B2 fix: runtime balance-based Phase 1B trigger (overrides pre-computed migPhase1bTrigger if balance drops below $60k early)
  let   migPhase1aAnnual   = 0;
  let   migPhase2Annual    = 0;
  let   migEffAnnualFactor = 1;
  let   migrationRaWarning = false; // true if RA < $60k at migration age

  // ─── SETUP — verbatim copy from runProjectionEngine ────────────────────────
  const startAge = Math.max(0, Number(inputs.currentAge) || 0);
  const baseYear = Number(inputs.currentYear) || 2026;
  const contribStop = overrideContribStop !== undefined ? overrideContribStop : (Number(inputs.contributionStopAge) || 95);
  const housingStop = Number(inputs.housingStopAge) || 95;
  // D4 Phase 2 (mirrored from runProjectionEngine): fractional first year.
  const _bm_rss = Math.min(12, Math.max(1, Number(inputs.birthMonth) || 6));
  const _cm_rss = Number(inputs.currentMonth) >= 1 && Number(inputs.currentMonth) <= 12 ? Number(inputs.currentMonth) : new Date().getMonth() + 1;
  const _mn_rss = (((_bm_rss - _cm_rss) % 12) + 12) % 12 || 12;
  const firstYearFraction = Math.max(1 / 12, Math.min(1, _mn_rss / 12));
  const salaryGrowth = (Number(inputs.salaryGrowthRate) || 0) / 100;
  const salaryBump = (overrideSalaryBump || 0) / 100;
  // Phase 2 is optional: "", null, and 0 all mean "no Phase 2". handleKeyDown can set
  // unedited fields to 0, so 0 must be treated identically to empty/null.
  const _salaryPhaseRaw = inputs.salaryPhaseAge !== "" && inputs.salaryPhaseAge != null ? Number(inputs.salaryPhaseAge) : null;
  const salaryPhaseAge  = _salaryPhaseRaw === 0 ? null : _salaryPhaseRaw;
  const salaryGrowthRate2 = (Number(inputs.salaryGrowthRate2) || 0) / 100;
  // Career break is now handled exclusively via Life Events (type: 'career_break') through leContribPaused.
  // The old careerBreakStartAge/EndAge fields have been removed from DEFAULT_INPUTS and are no longer read here.
  // BUG-10 fix: use shared makeComputeGF factory — removed duplicate inline definition.
  const computeGF = makeComputeGF(startAge, salaryGrowth, salaryPhaseAge, salaryGrowthRate2);
  const baseOA_Emp = Number(inputs.empOaCont) || 0;
  const baseSA_Emp = Number(inputs.empSaCont) || 0;
  const baseMA_Emp = Number(inputs.empMaCont) || 0;
  // ── Secondary employment — stacked on top of primary salary (RSS engine) ──
  const _secEnabledRSS = !!inputs.secondaryEmploymentEnabled;
  const _secGrossRSS   = _secEnabledRSS ? (Number(inputs.secondarySalaryGross) || 0) : 0;
  const _secOA_RSS     = Math.round(_secGrossRSS * 0.23 * 12);
  const _secSA_RSS     = Math.round(_secGrossRSS * 0.06 * 12);
  const _secMA_RSS     = Math.round(_secGrossRSS * 0.08 * 12);
  const _secStopRSS    = Number(inputs.secondaryContribStopAge) || 65;
  const vc3aCash   = Number(inputs.vc3aCash)  || 0;
  const vcVhrAmt   = Number(inputs.vcVhr)     || 0;
  const annualOaToSa      = Number(inputs.oaToSaTransfer) || 0;
  const annualOaToMa      = Number(inputs.oaToMaTransfer) || 0;
  const oaToMaForLovedOne = inputs.oaToMaForLovedOne === true;
  const oaToSaForLovedOne = inputs.oaToSaForLovedOne === true;
  const vc3aFreq      = inputs.vc3aFreq     || 'annual';
  const vcSaFreq      = inputs.vcSaFreq     || 'annual';
  const vcMaFreq      = inputs.vcMaFreq     || 'annual';
  const vcVhrFreq     = inputs.vcVhrFreq    || 'annual';
  const govGrantFreq   = inputs.govGrantFreq   || 'annual';
  const govGrantMaFreq = inputs.govGrantMaFreq || 'annual';
  const wisFreq       = inputs.wisFreq      || 'annual';
  const cpfisOaFreq   = inputs.cpfisOaFreq  || 'annual';
  const cpfisSaFreq   = inputs.cpfisSaFreq  || 'annual';
  const housingFreq   = inputs.housingFreq  || 'annual';
  const oaWithdrawalFreq = inputs.oaWithdrawalFreq || 'one-time';
  const oaToMaFreq    = inputs.oaToMaFreq   || 'annual';
  const oaToSaFreq    = inputs.oaToSaFreq   || 'annual';
  const vc3aDur   = Number(inputs.vc3aDur)   || 0;
  const vcSaDur   = Number(inputs.vcSaDur)   || 0;
  const vcMaDur   = Number(inputs.vcMaDur)   || 0;
  const vcVhrDur  = Number(inputs.vcVhrDur)  || 0;
  const govGrantDur   = Number(inputs.govGrantDur)   || 0;
  const govGrantMaDur = Number(inputs.govGrantMaDur) || 0;
  const wisDur    = Number(inputs.wisDur)    || 0;
  const cpfisOaDur  = Number(inputs.cpfisOaDur)  || 0;
  const cpfisSaDur  = Number(inputs.cpfisSaDur)  || 0;
  const housingDur  = Number(inputs.housingDur)  || 0;
  const oaToMaDur   = Number(inputs.oaToMaDur)   || 0;
  const oaToSaDur   = Number(inputs.oaToSaDur)   || 0;
  const oaEduLoanDur = Number(inputs.oaEduLoanDur) || 0;
  const oaWithdrawalDur = Number(inputs.oaWithdrawalDur) || 0;
  const vcMaCash = Number(inputs.vcMaCash) || 0;
  const rsGrowth = (Number(inputs.retirementSumGrowth) || 3) / 100;
  const _csNorm = (inputs.citizenStatus || 'SC').toUpperCase(); // Bug 2 fix: normalise case so 'sc'/'SC'/'Sc' all match
  const isSC = _csNorm === 'SC';
  const isPwD = !!inputs.isPwD;
  const wisAmount     = Number(inputs.wisAmount)    || 0;
  const cpfisOaAmount = Number(inputs.cpfisOaAmount) || 0;
  const cpfisSaAmount = Number(inputs.cpfisSaAmount) || 0;
  const baseHousing   = overrideHousingOutflow !== undefined ? overrideHousingOutflow : (Number(inputs.housingOutflow) || 0);
  const oaEduLoanAnnual = Number(inputs.oaEduLoan)    || 0;
  const oaEduLoanFreq   = inputs.oaEduLoanFreq || 'one-time';
  const baseMedical = (Number(inputs.medicalUsage) || 0) + (Number(inputs.medishieldIP) || 0);
  const elderCareShieldAmt = Number(inputs.elderCareShield) || 0; // Q1-C: CareShield Life only begins at age 30 — gated in loop
  const medInfl     = (Number(inputs.medicalInflationRate) || 0) / 100;
  const isSEP       = inputs.isSelfEmployed === true;
  const isLeasehold = inputs.propertyLeasehold === true;
  const totalLease  = Math.max(1, Number(inputs.propertyLeaseYears) || 99);
  const propGrowth  = (Number(inputs.propertyGrowthRate) || 0) / 100;
  // B1: Bala Curve — freehold-equivalent value anchored at projection start.
  // For leasehold: divide current value by balaRatio(remaining lease) to derive
  // the freehold equivalent; market growth is then applied to THAT base, and
  // the Bala ratio for the current remaining lease is applied each year.
  // For freehold: freeholdEquiv === propertyValue (ratio always 1.0).
  const _initBalaR   = isLeasehold ? balaRatio(totalLease) : 1;
  const freeholdEquiv = (_initBalaR > 0) ? (Number(inputs.propertyValue) || 0) / _initBalaR : (Number(inputs.propertyValue) || 0);
  const usePropertyPledge = inputs.usePropertyPledge === true;
  let privateAssets    = Number(inputs.currentPrivateAssets) || 0;
  const privateGrowth  = overridePrivGrowthRate !== undefined ? overridePrivGrowthRate / 100 : (Number(inputs.privateAssetGrowthRate) || 0) / 100;
  const privateSaving  = Number(inputs.annualPrivateSaving)  || 0;
  const plannedDownpaymentOA = Number(inputs.plannedDownpaymentOA) || 0;
  const downpaymentAge       = Number(inputs.downpaymentAge) || 35;
  let downpaymentApplied = startAge > downpaymentAge;
  // Housing grants — one-time OA credits at downpaymentAge, tracked in cumHousingOA/FV for CPF refund.
  // Property-type gated: EHG applies to BTO+Resale; Resale Grant and PHG are resale-only (verified:
  // HDB does not extend PHG to BTO buyers); Step-Up is BTO-only; none apply to private/no-property.
  const _pType = inputs.propertyType || 'hdb_bto';
  const _totalHousingGrants = (_pType === 'hdb_bto' || _pType === 'hdb_resale') ? (
    (Number(inputs.ehgAmount)||0)
    + (_pType === 'hdb_resale' ? (Number(inputs.cpfHousingGrantResale)||0) + (Number(inputs.phgAmount)||0) : 0)
    + (_pType === 'hdb_bto' ? (Number(inputs.stepUpGrantAmount)||0) : 0)
  ) : 0;
  let housingGrantApplied = startAge > downpaymentAge;
  // Insurance deductions from OA — dpsMode drives whether/how DPS is applied
  const _dpsMode = inputs.dpsMode || 'auto'; // "auto"|"optout"|"custom"
  const _hpsAnnual = Number(inputs.hpsAnnualPremium) || 0;
  // Shared CPF rate bases + SRS cap — from centralised helper (see _cpfEngineInit above)
  const { srsCap, _oaRateBase, _saRateBase, _maRateBase } = _cpfEngineInit(inputs);
  const srsContrib     = overrideSrsContrib !== undefined ? Math.min(overrideSrsContrib, srsCap) : Math.min(Number(inputs.srsAnnualContribution) || 0, srsCap);
  const srsContribStop = Number(inputs.srsContribStopAge)    || 63;
  const srsReturn      = (Number(inputs.srsReturnRate) || 0) / 100;
  const srsDrawStart   = Math.max(Number(inputs.srsDrawdownStartAge) || 63, 63);
  const srsDrawYears   = Math.min(Math.max(Number(inputs.srsDrawdownYears) || 10, 1), 10);
  let srsBalance        = Number(inputs.srsBalance) || 0;
  let srsDrawdownApplied = startAge >= srsDrawStart;
  let srsAnnualDraw      = 0;
  // Sprint-5 Item 23: rising equity glidepath (no-op when disabled — backward-compatible)
  const srsGlidepath    = !!inputs.srsGlidepathEnabled;
  const srsEqPct0       = Math.min(1, Math.max(0, (Number(inputs.srsGlidepathStartEquityPct) || 30) / 100));
  const srsEqRet        = (Number(inputs.srsGlidepathEquityReturn) || 7) / 100;
  const srsBndRet_gp    = (Number(inputs.srsBondReturn) || 3) / 100;
  const srsYearReturn   = (age) => {
    if (!srsGlidepath || age < srsDrawStart) return srsReturn;
    const eqPct = Math.min(0.60, srsEqPct0 + 0.02 * (age - srsDrawStart));
    return eqPct * srsEqRet + (1 - eqPct) * srsBndRet_gp;
  };
  const avgGlidepathReturn = (() => {
    if (!srsGlidepath || !srsDrawdownApplied || srsDrawYears <= 0) return srsReturn;
    let _gpSum = 0;
    for (let _i = 0; _i < srsDrawYears; _i++) {
      const _eqP = Math.min(0.60, srsEqPct0 + 0.02 * _i);
      _gpSum += _eqP * srsEqRet + (1 - _eqP) * srsBndRet_gp;
    }
    return _gpSum / srsDrawYears;
  })();
  // BUG-2 fix: when member is already past drawdown start age, the loop guard
  // (age === srsDrawStart && !srsDrawdownApplied) can never fire. Pre-compute
  // srsAnnualDraw here so the balance depletes correctly from the first year.
  if (srsDrawdownApplied && srsBalance > 0 && srsDrawYears > 0) {
    const _pmt1 = avgGlidepathReturn;
    srsAnnualDraw = _pmt1 > 0
      ? Math.round(srsBalance * _pmt1 / (1 - Math.pow(1 + _pmt1, -srsDrawYears)))
      : Math.round(srsBalance / srsDrawYears);
  }
  const yearsTo55  = Math.max(0, 55 - startAge);
  const projFRS55  = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + yearsTo55) - 2026)));
  const past55FRS  = Math.round(RETIREMENT_SUMS_2026.FRS / Math.pow(1 + rsGrowth, Math.max(0, startAge - 55)));
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
  const sellPropertyAge = Number(inputs.sellPropertyAge) || 0;
  let cumHousingOA = 0;
  let cumEduOut    = 0;
  let cumHousingFV = 0;
  let refundApplied = startAge >= sellPropertyAge && sellPropertyAge > 0;
  let cumRaCashTopUps = 0;
  let cumRaInterest   = 0;
  let cumMrssReceived = 0;
  let currentPropValue  = Number(inputs.propertyValue) || 0;
  let leaseRemaining    = totalLease;
  const oaWithdrawalAt55    = Number(inputs.oaWithdrawalAt55)      || 0;
  let withdrawalApplied     = startAge >= 55;
  const pledgeWithdrawalAmount = (usePropertyPledge && Number(inputs.pledgeWithdrawalAmount)) ? Number(inputs.pledgeWithdrawalAmount) : 0;
  const pledgeWithdrawalAge    = Math.max(55, Number(inputs.pledgeWithdrawalAge) || 55);
  let pledgeWithdrawalApplied  = startAge >= pledgeWithdrawalAge;
  const oaDrawdownStartAge  = Number(inputs.oaDrawdownStartAge) || 0;
  const oaDrawdownMonthly   = overrideOaDrawdownMonthly !== undefined ? overrideOaDrawdownMonthly : (Number(inputs.oaDrawdownMonthly) || 0);
  const oaDrawdownAnnual    = oaDrawdownMonthly * 12;
  const oaDrawdownFloor     = Number(inputs.oaDrawdownFloor) || 0;
  const oaDrawdownActive    = oaDrawdownStartAge > 0 && oaDrawdownMonthly > 0;
  const propMonetiseEnabled = inputs.propMonetiseEnabled === true;
  const propMonetiseAge     = Number(inputs.propMonetiseAge)          || 65;
  const propMonetiseCash    = Number(inputs.propMonetiseCashProceeds) || 0;
  const propMonetiseRaTopup = Number(inputs.propMonetiseRaTopup)      || 0;
  let propMonetiseApplied   = startAge >= propMonetiseAge && propMonetiseEnabled;
  // LBS monthly income stream — only active when scheme = 'lbs'
  const _lbsMonthlyRSS = (propMonetiseEnabled && inputs.propMonetiseScheme === 'lbs') ? (Number(inputs.lbsMonthlyPayout) || 0) : 0;
  const _lbsEndAgeRSS  = Number(inputs.lbsPayoutEndAge) || 85;
  // Rental income — recurring cash inflow to private assets, independent of prop monetise
  const _rentalMonthlyRSS = Number(inputs.rentalIncome) || 0;
  const _rentalStartRSS   = Number(inputs.rentalStartAge) || 0;
  const _rentalEndRSS     = Number(inputs.rentalEndAge) || 85;
  const _rentExpMonthlyRSS = Number(inputs.rentExpense) || 0;
  const _rentExpStartRSS   = Number(inputs.rentExpStartAge) || 0;
  const _rentExpEndRSS     = Number(inputs.rentExpEndAge) || 85;
  const owMonthly            = Math.min(Number(inputs.salaryGross) || 0, 8000);
  const owAnnualSubjectToCPF = owMonthly * 12;
  const awCeiling            = Math.max(0, 102000 - owAnnualSubjectToCPF);
  const isPR          = _csNorm === 'PR';
  const isForeigner   = _csNorm === 'FOREIGNER'; // BUG-1 fix: _csNorm is .toUpperCase() so must compare uppercase
  const startPrYear   = Math.min(3, Math.max(1, Number(inputs.prYear) || 3));
  const annualGrossSalary = owMonthly * 12;
  let currentPrYear   = startPrYear;
  let pendingMmssCarry = 0;
  let earlyRetireFired = false;
  const data = [];

  // BHS is permanently locked at the value prevailing on the member's 65th birthday
  // (CPF Board policy). For members already ≥65 at simulation start, approximated
  // at the 2026 table value (pre-2026 historical BHS not stored in this model).
  // This constant caps every BHS formula so MA headroom, VCMA, MMSS and overflow
  // are all correctly constrained post-65.
  const bhsLockedYear = Math.max(2026, baseYear + (65 - startAge));

  // ─── YEAR LOOP ──────────────────────────────────────────────────────────────
  for (let age = startAge; age <= maxAge; age++) {
    let yearInflow    = 0;
    let yearMandatory = 0;
    let yearVoluntary = 0;
    let yearGovGrants = 0;
    let yearWisCash   = 0;
    let yearOaInterest = 0, yearSaRaInterest = 0, yearMaInterest = 0;
    let yearHousingOut = 0, yearMedOut = 0, yearOaDrawOut = 0, yearLovedOneOut = 0, yearRentExpOut = 0;
    let yearEventsIn = 0, yearEventsOut = 0;
    let yearCpfisOut = 0, yearEduOut = 0;
    let rssPayoutThisYear = 0;  // ← RSS-specific; 0 until rssPayoutStart reached

    // Life events
    const activeEvents     = (inputs.lifeEvents || []).filter(e => e.enabled !== false && Number(e.startAge) <= age && age <= Number(e.endAge));
    const leContribPaused  = activeEvents.some(e => e.type === 'retrenchment' || e.type === 'career_break');
    const leSalaryCut      = activeEvents.find(e => e.type === 'salary_cut');
    const salaryCutFactor  = leSalaryCut ? Math.max(0, 1 - (Number(leSalaryCut.magnitude) || 0) / 100) : 1;
    const leEarlyRetire    = activeEvents.some(e => e.type === 'early_retirement');
    if (leEarlyRetire) earlyRetireFired = true;
    const leHyperinflation = activeEvents.find(e => e.type === 'hyperinflation');
    const leMedicalEvents  = activeEvents.filter(e => e.type === 'medical_crisis');
    const leWindfallEvents = activeEvents.filter(e => e.type === 'windfall' && age === Number(e.startAge));
    // New event types (gap-analysis pass)
    const leMarriageEvent  = activeEvents.find(e => e.type === 'marriage' && age === Number(e.startAge));
    const leChildBirth     = activeEvents.find(e => e.type === 'child_birth' && age === Number(e.startAge));
    const leLoanEvents     = activeEvents.filter(e => e.type === 'loan_repayment');
    const leParentSupport  = activeEvents.filter(e => e.type === 'parent_support');
    const leEducation      = activeEvents.filter(e => e.type === 'education_expense');
    const leDonation       = activeEvents.filter(e => e.type === 'donation');
    // Barista FIRE: part-time income with scaled employee-only CPF contributions
    const leBaristaFire    = activeEvents.find(e => e.type === 'barista_fire');
    const baristaMonthly   = leBaristaFire ? (Number(leBaristaFire.magnitude) || 0) : 0;
    const baristaAnnual    = baristaMonthly * 12;
    // Monthly part-time pay vs monthly salary (salaryGross is monthly). Part-time pay is assumed
    // to grow with the same salary-growth path, so contributions scale by this ratio.
    const baristaScale     = (baristaMonthly > 0 && (Number(inputs.salaryGross) || 0) > 0)
      ? Math.min(1, baristaMonthly / Number(inputs.salaryGross))
      : 0;

    // MMSS carry
    if (pendingMmssCarry > 0) { ma += pendingMmssCarry; yearGovGrants += pendingMmssCarry; yearInflow += pendingMmssCarry; totalInjected += pendingMmssCarry; pendingMmssCarry = 0; }

    // Frequency & duration gating
    const isFirstYear  = age === startAge;
    const yearIdx      = age - startAge;
    const effVc3aFreq  = vc3aFreq  === 'one-time' && !isFirstYear ? 0 : (vc3aDur  > 0 && yearIdx >= vc3aDur)  ? 0 : 1;
    const effVcSaFreq  = vcSaFreq  === 'one-time' && !isFirstYear ? 0 : (vcSaDur  > 0 && yearIdx >= vcSaDur)  ? 0 : 1;
    const effVcMaFreq  = vcMaFreq  === 'one-time' && !isFirstYear ? 0 : (vcMaDur  > 0 && yearIdx >= vcMaDur)  ? 0 : 1;
    const effVcVhrFreq = vcVhrFreq === 'one-time' && !isFirstYear ? 0 : (vcVhrDur > 0 && yearIdx >= vcVhrDur) ? 0 : 1;
    const effGovGrantFreq   = govGrantFreq   === 'one-time' && !isFirstYear ? 0 : (govGrantDur   > 0 && yearIdx >= govGrantDur)   ? 0 : 1;
    const effGovGrantMaFreq = govGrantMaFreq === 'one-time' && !isFirstYear ? 0 : (govGrantMaDur > 0 && yearIdx >= govGrantMaDur) ? 0 : 1;
    const effWisFreq   = wisFreq   === 'one-time' && !isFirstYear ? 0 : (wisDur   > 0 && yearIdx >= wisDur)   ? 0 : 1;
    const effCpfisOaFreq = cpfisOaFreq === 'one-time' && !isFirstYear ? 0 : (cpfisOaDur > 0 && yearIdx >= cpfisOaDur) ? 0 : 1;
    const effCpfisSaFreq = cpfisSaFreq === 'one-time' && !isFirstYear ? 0 : (cpfisSaDur > 0 && yearIdx >= cpfisSaDur) ? 0 : 1;
    const effHousingFreq = housingFreq === 'one-time' && !isFirstYear ? 0 : (housingDur > 0 && yearIdx >= housingDur) ? 0 : 1;
    const effOaToMaFreq  = oaToMaFreq  === 'one-time' && !isFirstYear ? 0 : (oaToMaDur  > 0 && yearIdx >= oaToMaDur)  ? 0 : 1;
    const effOaToSaFreq  = oaToSaFreq  === 'one-time' && !isFirstYear ? 0 : (oaToSaDur  > 0 && yearIdx >= oaToSaDur)  ? 0 : 1;


    // Gov Grant to MA (e.g. MediSave Grant for Newborns, CHAS, ElderFund).
    // Previously the MGN was hardcoded; now driven by govGrantMa input.
    const bhsNow = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
    const govGrantMaAmt = Math.min((Number(inputs.govGrantMa) || 0) * effGovGrantMaFreq, Math.max(0, bhsNow - ma));
    if (govGrantMaAmt > 0) {
      ma += govGrantMaAmt;
      yearGovGrants += govGrantMaAmt;
      yearInflow    += govGrantMaAmt;
      totalInjected += govGrantMaAmt;
    }

    // Opening balances for mid-year interest
    const oaOpen = oa, saOpen = sa, maOpen = ma, raOpen = ra;

    // Private assets
    let yearPrivDrawOut = 0;
    if (age > startAge) { privateAssets = privateAssets * (1 + privateGrowth) + privateSaving; } else { privateAssets += privateSaving; }
    // Barista FIRE: credit take-home pay (part-time salary minus scaled employee CPF) to private assets
    if (leBaristaFire && baristaAnnual > 0) {
      const _baristaEmpCPF = Math.round(baristaAnnual * scEmployeeRate(age, baseYear + (age - startAge))); // employee share only
      const _baristaTakeHome = Math.max(0, baristaAnnual - _baristaEmpCPF);
      privateAssets += _baristaTakeHome;
      yearInflow    += _baristaTakeHome;
    }
    if (overridePrivDrawdown > 0 && overridePrivDrawdownStart > 0 && age >= overridePrivDrawdownStart) {
      const actualPrivDraw = Math.min(overridePrivDrawdown, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actualPrivDraw);
      yearPrivDrawOut = actualPrivDraw;
    }

    // SRS (Item 23: glidepath-aware growth and PMT)
    if (age > startAge) srsBalance = srsBalance * (1 + srsYearReturn(age));
    if (age >= 18 && age <= srsContribStop && age < srsDrawStart) srsBalance += srsContrib;
    if (age === srsDrawStart && !srsDrawdownApplied) {
      const _pmt1r = avgGlidepathReturn;
      srsAnnualDraw = srsDrawYears > 0 ? (_pmt1r > 0 ? Math.round(srsBalance * _pmt1r / (1 - Math.pow(1 + _pmt1r, -srsDrawYears))) : Math.round(srsBalance / srsDrawYears)) : srsBalance;
      srsDrawdownApplied = true;
    }
    if (srsDrawdownApplied && age >= srsDrawStart && age < srsDrawStart + srsDrawYears) { srsBalance = Math.max(0, srsBalance - srsAnnualDraw); }
    if (srsDrawdownApplied && age === srsDrawStart + srsDrawYears - 1) srsBalance = 0;

    // Housing grants — one-time OA credit at downpaymentAge (same year as downpayment)
    // CPF policy: grants are included in cumHousingOA/FV and must be refunded on sale with 2.5%/yr interest
    if (!housingGrantApplied && age === downpaymentAge && _totalHousingGrants > 0 && !isForeigner) {
      oa += _totalHousingGrants;
      cumHousingOA += _totalHousingGrants;
      cumHousingFV += _totalHousingGrants;
      housingGrantApplied = true;
    }

    // Downpayment
    if (age === downpaymentAge && plannedDownpaymentOA > 0 && !downpaymentApplied) {
      const actualDownpayment = Math.min(oa, plannedDownpaymentOA);
      oa -= actualDownpayment; cumHousingOA += actualDownpayment; cumHousingFV += actualDownpayment; downpaymentApplied = true;
    }

    // SA closure at 55
    if (age === 55 && startAge < 55) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
      const fromOA = Math.min(Math.max(0, oa - 5000), req); ra += fromOA; oa -= fromOA;
    } else if (age === startAge && startAge >= 55 && sa > 0) {
      let req = Math.max(0, cohortRetSum - ra);
      const fromSA = Math.min(sa, req); ra += fromSA; req -= fromSA;
      oa += (sa - fromSA); sa = 0;
    }

    // OA withdrawal at 55
    if (oaWithdrawalAt55 > 0) {
      if (oaWithdrawalFreq === 'annual') {
        if (age >= 55 && (oaWithdrawalDur === 0 || yearIdx < oaWithdrawalDur)) { const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor)); oa -= actualW55; yearOaDrawOut += actualW55; totalOutSpent += actualW55; }
      } else {
        if (age === 55 && !withdrawalApplied) { const actualW55 = Math.min(oaWithdrawalAt55, Math.max(0, oa - oaDrawdownFloor)); oa -= actualW55; yearOaDrawOut += actualW55; totalOutSpent += actualW55; withdrawalApplied = true; }
      }
    }

    // Pledge RA withdrawal
    if (usePropertyPledge && pledgeWithdrawalAmount > 0 && age === pledgeWithdrawalAge && !pledgeWithdrawalApplied) {
      const projBRS_pw = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
      const actualPledgeWithdraw = Math.min(pledgeWithdrawalAmount, Math.max(0, ra - projBRS_pw));
      ra = Math.max(0, ra - actualPledgeWithdraw); totalOutSpent += actualPledgeWithdraw; yearOaDrawOut += actualPledgeWithdraw; pledgeWithdrawalApplied = true;
    }

    // OA→SA/RA transfers
    if (age < 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) {
      const actualTransfer = oaToSaForLovedOne ? Math.min(annualOaToSa, oa) : (() => { const projFRS_oaToSa = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026))); return Math.min(annualOaToSa, oa, Math.max(0, projFRS_oaToSa - sa)); })();
      oa -= actualTransfer;
      if (!oaToSaForLovedOne) { sa += actualTransfer; } else { yearLovedOneOut += actualTransfer; totalOutSpent += actualTransfer; }
    }
    if (age >= 55 && annualOaToSa > 0 && effOaToSaFreq > 0 && !isForeigner) {
      const actualTransferRA = oaToSaForLovedOne ? Math.min(annualOaToSa, oa) : (() => { const projERS_oaToRa = Math.round(projectedSum('ERS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026))); return Math.min(annualOaToSa, oa, Math.max(0, projERS_oaToRa - ra)); })();
      oa -= actualTransferRA;
      if (!oaToSaForLovedOne) { ra += actualTransferRA; cumRaCashTopUps += actualTransferRA; } else { yearLovedOneOut += actualTransferRA; totalOutSpent += actualTransferRA; }
    }

    // OA→MA transfer
    if (age >= 55 && annualOaToMa > 0 && effOaToMaFreq > 0 && !isForeigner) {
      const projBHS_tr = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
      const actualOaToMa = Math.min(annualOaToMa, oa, oaToMaForLovedOne ? annualOaToMa : Math.max(0, projBHS_tr - ma));
      oa -= actualOaToMa;
      if (!oaToMaForLovedOne) { ma += actualOaToMa; } else { yearLovedOneOut += actualOaToMa; totalOutSpent += actualOaToMa; }
    }

    // vcMaCash
    const maBeforeVcMa = ma;
    if (vcMaCash * effVcMaFreq > 0 && !isForeigner) {
      const projBHS_vcma = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
      const actualVcMa = Math.min(vcMaCash * effVcMaFreq, Math.max(0, projBHS_vcma - ma));
      ma += actualVcMa; yearInflow += actualVcMa; totalInjected += actualVcMa; yearVoluntary += actualVcMa;
    }

    // MMSS
    const effectiveBaseYear_mmss = Math.max(MMSS_PILOT_START_YEAR, baseYear);
    const simYear_mmss = effectiveBaseYear_mmss + (age - startAge);
    const gf_mmss = leContribPaused ? 0 : computeGF(age, salaryBump);
    const owAnnualScaled_mmss = Math.min(owMonthly * 12 * gf_mmss, 96000);
    const awCeilingMmss = Math.max(0, 102000 - owAnnualScaled_mmss);
    const bonusMmss     = Math.min((Number(inputs.salaryBonus) || 0) * gf_mmss, awCeilingMmss);
    const mmssMonthlyIncome = isSEP ? (leContribPaused ? 0 : (Number(inputs.netTradeIncome) || 0) / 12) : Math.round((owAnnualScaled_mmss + bonusMmss) / 12);
    if (isSC && age >= 55 && age <= 70 && simYear_mmss >= MMSS_PILOT_START_YEAR && simYear_mmss <= MMSS_PILOT_END_YEAR && mmssMonthlyIncome <= 4000) {
      const projBHS_mm = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(simYear_mmss, bhsLockedYear) - 2026)));
      if (maBeforeVcMa < projBHS_mm / 2) {
        const vcMaThis = vcMaCash * effVcMaFreq;
        if (vcMaThis > 0) { const actualMmss = Math.min(vcMaThis, 1000, Math.max(0, projBHS_mm - ma)); if (actualMmss > 0) pendingMmssCarry += actualMmss; }
      }
    }

    // CPFIS
    if (cpfisOaAmount * effCpfisOaFreq > 0 && age >= 18 && !isForeigner) {
      const actualCpfisOa = Math.min(cpfisOaAmount * effCpfisOaFreq, Math.max(0, oa - 20000));
      oa -= actualCpfisOa; yearCpfisOut += actualCpfisOa; totalOutSpent += actualCpfisOa;
    }
    if (cpfisSaAmount * effCpfisSaFreq > 0 && age < 55 && age >= 18 && !isForeigner) {
      const actualCpfisSa = Math.min(cpfisSaAmount * effCpfisSaFreq, Math.max(0, sa - 40000));
      sa -= actualCpfisSa; yearCpfisOut += actualCpfisSa; totalOutSpent += actualCpfisSa;
    }

    // Contribution block
    if (age < contribStop && !isForeigner && !leEarlyRetire && !earlyRetireFired) {
      // Barista FIRE: scale contributions to part-time salary; employer CPF not modelled
      const _baristaGfScale = leBaristaFire ? baristaScale : salaryCutFactor;
      const gf = leContribPaused ? 0 : computeGF(age, salaryBump) * _baristaGfScale;
      const mandatorySA_base = Math.round(baseSA_Emp * gf);
      if (isSEP) {
        const nti = Number(inputs.netTradeIncome) || 0;
        let sepMandatoryMA = 0;
        if (nti > 6000) { let maRate = 0.08; if (age > 50) maRate = 0.105; else if (age > 45) maRate = 0.10; else if (age > 35) maRate = 0.09; sepMandatoryMA = Math.round(Math.min(nti, 96000) * maRate); }
        const vc3aTotal = Math.min(vc3aCash * effVc3aFreq, Math.max(0, ANNUAL_LIMIT - sepMandatoryMA));
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if      (age <= 35) { vc3aOaRatio=0.23; vc3aSaRatio=0.06;  vc3aMaRatio=0.08;  }
        else if (age <= 45) { vc3aOaRatio=0.21; vc3aSaRatio=0.07;  vc3aMaRatio=0.09;  }
        else if (age <= 50) { vc3aOaRatio=0.19; vc3aSaRatio=0.08;  vc3aMaRatio=0.10;  }
        else if (age <= 55) { vc3aOaRatio=0.15; vc3aSaRatio=0.115; vc3aMaRatio=0.105; }
        else if (age <= 60) { vc3aOaRatio=0.12; vc3aSaRatio=0.115; vc3aMaRatio=0.105; }
        else if (age <= 65) { vc3aOaRatio=0.035;vc3aSaRatio=0.11;  vc3aMaRatio=0.105; }
        else if (age <= 70) { vc3aOaRatio=0.01; vc3aSaRatio=0.05;  vc3aMaRatio=0.105; }
        else                { vc3aOaRatio=0.01; vc3aSaRatio=0.01;  vc3aMaRatio=0.105; }
        const ratioSum = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        // VHR-FRS: separate VHR from VC3A so it can be FRS-routed below
        const sepVhrAmt  = vcVhrAmt * effVcVhrFreq;
        const toOA_vc3a  = Math.round(vc3aTotal * (vc3aOaRatio / ratioSum)); // VC3A OA portion only
        const toMA_vc3a  = Math.round(vc3aTotal * (vc3aMaRatio / ratioSum));
        const toSA_vc3a  = vc3aTotal - toOA_vc3a - toMA_vc3a;
        const wisToMA_sep = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.9) : 0;
        yearWisCash = wisAmount > 0 ? Math.round(wisAmount * effWisFreq * 0.1) : 0;
        const projBHS_i = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
        const maRoom = Math.max(0, projBHS_i - ma);
        const actualMandatoryMA_sep = Math.min(sepMandatoryMA, maRoom);
        const vcMaRoomSep = Math.max(0, maRoom - actualMandatoryMA_sep);
        const actualVcMA_sep = Math.min(toMA_vc3a, vcMaRoomSep);
        const maSpill = (sepMandatoryMA - actualMandatoryMA_sep) + (toMA_vc3a - actualVcMA_sep);
        const remainingMaRoom = Math.max(0, maRoom - actualMandatoryMA_sep - actualVcMA_sep);
        const actualToMAWis = Math.min(wisToMA_sep, remainingMaRoom);
        const wisMASpill = wisToMA_sep - actualToMAWis;
        ma += (actualMandatoryMA_sep + actualVcMA_sep + actualToMAWis);
        const projFRS_sep = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        if (age >= 55) {
          const raRoom_sep = Math.max(0, projFRS_sep - ra);
          const toRA_sep = Math.min(toSA_vc3a + maSpill + wisMASpill, raRoom_sep);
          ra += toRA_sep; oa += (toSA_vc3a + maSpill + wisMASpill - toRA_sep);
        } else {
          const saRoomSep = Math.max(0, projFRS_sep - sa);
          const toSA_total = toSA_vc3a + maSpill + wisMASpill;
          const actualToSA_sep = Math.min(toSA_total, saRoomSep);
          sa += actualToSA_sep; oa += (toSA_total - actualToSA_sep);
        }
        oa += toOA_vc3a;
        // VHR-FRS-FIX SEP: route housing refund to RA/SA first if below FRS, surplus to OA
        if (sepVhrAmt > 0) {
          const yrOff_vs1 = Math.max(0, (baseYear + (age - startAge)) - 2026);
          const frs_vs1   = Math.round(projectedSum('FRS', rsGrowth, yrOff_vs1));
          if (age >= 55) {
            const raRm_vs1 = Math.max(0, frs_vs1 - ra);
            const toRA_vs1 = Math.min(sepVhrAmt, raRm_vs1);
            ra += toRA_vs1; oa += (sepVhrAmt - toRA_vs1);
            if (toRA_vs1 > 0) cumRaCashTopUps += toRA_vs1;
          } else {
            const saRm_vs1 = Math.max(0, frs_vs1 - sa);
            const toSA_vs1 = Math.min(sepVhrAmt, saRm_vs1);
            sa += toSA_vs1; oa += (sepVhrAmt - toSA_vs1);
          }
        }
        const projBRS_sep = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_sep = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_sep = age >= 55 ? ra < projBRS_sep : (oa + sa) < projBRS_sep;
        const mrssIncomeOk_sep = mmssMonthlyIncome <= 4000;
        const vcSaThis_sep = (overrideVcSA !== undefined ? overrideVcSA : (Number(inputs.vcSaTopup) || 0)) * effVcSaFreq;
        const mrssEligible_sep = isSC && mrssAgeOk_sep && mrssBalOk_sep && mrssIncomeOk_sep && cumMrssReceived < 20000 && vcSaThis_sep > 0;
        const actualMrss_sep = mrssEligible_sep ? Math.min(vcSaThis_sep, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_sep > 0) cumMrssReceived += actualMrss_sep;
        const govGrant_sep = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        if (age >= 55) { ra += govGrant_sep + actualMrss_sep; } else { sa += govGrant_sep + actualMrss_sep; }
        const sepContribInflow = vc3aTotal + vcVhrAmt * effVcVhrFreq + sepMandatoryMA + govGrant_sep + actualMrss_sep + wisToMA_sep;
        yearInflow += sepContribInflow; totalInjected += sepContribInflow;
        cumRaCashTopUps += toSA_vc3a + maSpill + wisMASpill + govGrant_sep + actualMrss_sep;
        yearMandatory += actualMandatoryMA_sep;
        yearVoluntary += vc3aTotal + vcVhrAmt * effVcVhrFreq;
        yearGovGrants += govGrant_sep + actualMrss_sep + wisToMA_sep;
      } else {
        let mandatoryOA_i, mandatorySA_dyn, mandatoryMA_i;
        if (isPR && currentPrYear < 3) {
          const prRates = getPRRates(currentPrYear, age, inputs.prRateType || 'GG');
          const grossScaled = annualGrossSalary * gf;
          const owScaledCapped = Math.min(grossScaled, 96000);
          const awCeilingEng = Math.max(0, 102000 - owScaledCapped);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = owScaledCapped + bonusCpfEng;
          mandatoryOA_i = Math.round(totalScaled * prRates.oa);
          mandatorySA_dyn = Math.round(totalScaled * prRates.sa);
          mandatoryMA_i = Math.round(totalScaled * prRates.ma);
        } else if (isPR && startPrYear < 3) {
          const _bandB = scAllocBand(age, baseYear + (age - startAge));
          const scOA = _bandB.oa, scSA = _bandB.sa, scMA = _bandB.ma;
          const grossScaled = Math.min(annualGrossSalary * gf, 96000);
          const awCeilingEng = Math.max(0, 102000 - grossScaled);
          const bonusCpfEng = Math.min((Number(inputs.salaryBonus) || 0) * gf, awCeilingEng);
          const totalScaled = grossScaled + bonusCpfEng;
          mandatoryOA_i = Math.round(totalScaled * scOA);
          mandatorySA_dyn = Math.round(totalScaled * scSA);
          mandatoryMA_i = Math.round(totalScaled * scMA);
        } else {
          // Path C — user-entered contributions, rescaled to the age band in force this year
          // (2026 step-down at 55/60/65/70) and re-split by that band's OA/SA/MA allocation.
          const _bandStart = scAllocBand(startAge, baseYear), _bandNow = scAllocBand(age, baseYear + (age - startAge));
          const _cTotal = (baseOA_Emp + baseSA_Emp + baseMA_Emp) * gf * (_bandNow.total / _bandStart.total);
          mandatoryOA_i   = Math.round(_cTotal * _bandNow.oa / _bandNow.total);
          mandatorySA_dyn = Math.round(_cTotal * _bandNow.sa / _bandNow.total);
          mandatoryMA_i   = Math.round(_cTotal * _bandNow.ma / _bandNow.total);
          const totalC = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
          if (totalC > ANNUAL_LIMIT) { const scaleC = ANNUAL_LIMIT / totalC; mandatoryOA_i = Math.round(mandatoryOA_i * scaleC); mandatorySA_dyn = Math.round(mandatorySA_dyn * scaleC); mandatoryMA_i = ANNUAL_LIMIT - mandatoryOA_i - mandatorySA_dyn; }
        }
        // ── Secondary employment: stack contributions from second income ──────
        if (_secEnabledRSS && age < _secStopRSS) {
          mandatoryOA_i   += Math.round(_secOA_RSS * gf);
          mandatorySA_dyn += Math.round(_secSA_RSS * gf);
          mandatoryMA_i   += Math.round(_secMA_RSS * gf);
        }
        let vc3aOaRatio, vc3aSaRatio, vc3aMaRatio;
        if      (age <= 35) { vc3aOaRatio=0.23; vc3aSaRatio=0.06;  vc3aMaRatio=0.08;  }
        else if (age <= 45) { vc3aOaRatio=0.21; vc3aSaRatio=0.07;  vc3aMaRatio=0.09;  }
        else if (age <= 50) { vc3aOaRatio=0.19; vc3aSaRatio=0.08;  vc3aMaRatio=0.10;  }
        else if (age <= 55) { vc3aOaRatio=0.15; vc3aSaRatio=0.115; vc3aMaRatio=0.105; }
        else if (age <= 60) { vc3aOaRatio=0.12; vc3aSaRatio=0.115; vc3aMaRatio=0.105; }
        else if (age <= 65) { vc3aOaRatio=0.035;vc3aSaRatio=0.11;  vc3aMaRatio=0.105; }
        else if (age <= 70) { vc3aOaRatio=0.01; vc3aSaRatio=0.05;  vc3aMaRatio=0.105; }
        else                { vc3aOaRatio=0.01; vc3aSaRatio=0.01;  vc3aMaRatio=0.105; }
        const ratioSum_emp = vc3aOaRatio + vc3aSaRatio + vc3aMaRatio;
        const wisCpf = wisAmount * effWisFreq > 0 ? Math.round(wisAmount * effWisFreq * 0.6) : 0;
        yearWisCash = Math.round(wisAmount * effWisFreq * 0.4);
        const wisOA = Math.round(wisCpf * (vc3aOaRatio / ratioSum_emp));
        const wisMA = Math.round(wisCpf * (vc3aMaRatio / ratioSum_emp));
        const wisSA = wisCpf - wisOA - wisMA;
        const vc3aCashEff = vc3aCash * effVc3aFreq;
        const vcVhrAmtEff = vcVhrAmt * effVcVhrFreq;
        const vc3aOA = Math.round(vc3aCashEff * (vc3aOaRatio / ratioSum_emp));
        const vc3aMA = Math.round(vc3aCashEff * (vc3aMaRatio / ratioSum_emp));
        const vc3aSA = vc3aCashEff - vc3aOA - vc3aMA;
        const totalMandatory = mandatoryOA_i + mandatorySA_dyn + mandatoryMA_i;
        const vcRoomThisYear = Math.max(0, ANNUAL_LIMIT - totalMandatory);
        const vc3aScale = vc3aCashEff > 0 && vc3aCashEff > vcRoomThisYear ? vcRoomThisYear / vc3aCashEff : 1;
        // VHR-FRS-FIX: VHR is no longer bundled into cappedVcOA.
        // It is applied separately AFTER SA/RA crediting so the FRS routing
        // logic below can correctly fill RA (post-55) / SA (pre-55) before OA.
        const cappedVcOA = Math.round(vc3aOA * vc3aScale); // VC3A OA portion only — VHR handled below
        const cappedVcSA = overrideVcSA !== undefined
          ? Math.round(overrideVcSA * vc3aScale) + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq
          : Math.round(vc3aSA * vc3aScale) + (Number(inputs.vcSaTopup) || 0) * effVcSaFreq + (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        const cappedVcMA = Math.round(vc3aMA * vc3aScale);
        const totalOA = mandatoryOA_i + cappedVcOA + wisOA;
        const projBHS_emp = Math.round(projectedSum('BHS', rsGrowth, Math.max(0, Math.min(baseYear + (age - startAge), bhsLockedYear) - 2026)));
        const maRoomEmp = Math.max(0, projBHS_emp - ma);
        const actualMandatoryMA_emp = Math.min(mandatoryMA_i, maRoomEmp);
        const vcMaRoomEmp = Math.max(0, maRoomEmp - actualMandatoryMA_emp);
        const actualVcMA_emp = Math.min(cappedVcMA, vcMaRoomEmp);
        const wisMARoom_emp = Math.max(0, vcMaRoomEmp - actualVcMA_emp);
        const actualWisMA_emp = Math.min(wisMA, wisMARoom_emp);
        const actualMA = actualMandatoryMA_emp + actualVcMA_emp + actualWisMA_emp;
        const maSpillEmp = (mandatoryMA_i + cappedVcMA + wisMA) - actualMA;
        oa += totalOA; ma += actualMA;
        // FIX-maSpill: include maSpillEmp in the inflow base so MA contributions that
        // overflow BHS and redirect to SA/RA/OA are tracked in totalInjected.
        // Previously maSpillEmp credited SA or RA but was excluded from yearInflow /
        // totalInjected, causing the "How your CPF grew" formula to undercount by ~$9k.
        const empContribInflowBase = totalOA + mandatorySA_dyn + cappedVcSA + actualMA + maSpillEmp + wisSA + vcVhrAmtEff; // VHR restored: removed from cappedVcOA, must reappear here for accurate yearInflow tracking
        yearMandatory += mandatoryOA_i + mandatorySA_dyn + actualMandatoryMA_emp;
        const govGrantContrib_emp = (Number(inputs.annualGovGrant) || 0) * effGovGrantFreq;
        yearVoluntary += cappedVcOA + (vc3aCashEff > 0 ? actualVcMA_emp : 0) + (cappedVcSA - govGrantContrib_emp) + vcVhrAmtEff;
        const projBRS_emp = Math.round(projectedSum('BRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        const mrssAgeOk_emp = age >= 55 || (isPwD && age < 55);
        const mrssBalOk_emp = age >= 55 ? ra < projBRS_emp : (oa + sa) < projBRS_emp;
        const owAnnualScaled_mrss = Math.min(owMonthly * 12 * gf, 96000);
        const bonusMrss = Math.min((Number(inputs.salaryBonus) || 0) * gf, Math.max(0, 102000 - owAnnualScaled_mrss));
        const mrssIncomeOk_emp = Math.round((owAnnualScaled_mrss + bonusMrss) / 12) <= 4000;
        const vcSaThis_emp = (overrideVcSA !== undefined ? overrideVcSA : (Number(inputs.vcSaTopup) || 0)) * effVcSaFreq;
        const mrssEligible_emp = isSC && mrssAgeOk_emp && mrssBalOk_emp && mrssIncomeOk_emp && cumMrssReceived < 20000 && vcSaThis_emp > 0;
        const actualMrss_emp = mrssEligible_emp ? Math.min(vcSaThis_emp, 2000, 20000 - cumMrssReceived) : 0;
        if (actualMrss_emp > 0) cumMrssReceived += actualMrss_emp;
        yearGovGrants += (Number(inputs.annualGovGrant)||0) * effGovGrantFreq + actualMrss_emp + wisCpf * effWisFreq;
        const empContribInflow = empContribInflowBase + actualMrss_emp;
        yearInflow += empContribInflow; totalInjected += empContribInflow;
        if (age >= 55) {
          let roomInRA_Mand = Math.max(0, cohortRetSum - ra);
          let mandToRA = Math.min(mandatorySA_dyn, roomInRA_Mand);
          ra += mandToRA; oa += (mandatorySA_dyn - mandToRA);
          const projFRS_vc3a_emp = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          const vcToRA = Math.min(cappedVcSA + maSpillEmp + wisSA, Math.max(0, projFRS_vc3a_emp - ra));
          ra += vcToRA; oa += (cappedVcSA + maSpillEmp + wisSA - vcToRA);
          ra += actualMrss_emp; cumRaCashTopUps += vcToRA + actualMrss_emp;
        } else {
          const projFRS_sa = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
          const totalToSA = mandatorySA_dyn + cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
          const saRoom = Math.max(0, projFRS_sa - sa);
          const actualToSA = Math.min(totalToSA, saRoom);
          sa += actualToSA; oa += (totalToSA - actualToSA);
          cumRaCashTopUps += cappedVcSA + maSpillEmp + wisSA + actualMrss_emp;
        }

        // ── VHR: Housing Refund — route to RA/SA before OA when below FRS ─────
        // CPF policy: when a voluntary housing refund is made and RA (post-55) or
        // SA (pre-55) is below the cohort FRS, refund flows to RA/SA first until
        // FRS is reached; any surplus flows to OA.
        if (vcVhrAmtEff > 0) {
          const yrOffsetVhr = Math.max(0, (baseYear + (age - startAge)) - 2026);
          const projFRS_vhr  = Math.round(projectedSum('FRS', rsGrowth, yrOffsetVhr));
          if (age >= 55) {
            const raRoomVhr = Math.max(0, projFRS_vhr - ra);
            const vhrToRA   = Math.min(vcVhrAmtEff, raRoomVhr);
            ra += vhrToRA; oa += (vcVhrAmtEff - vhrToRA);
            if (vhrToRA > 0) cumRaCashTopUps += vhrToRA;
          } else {
            const saRoomVhr = Math.max(0, projFRS_vhr - sa);
            const vhrToSA   = Math.min(vcVhrAmtEff, saRoomVhr);
            sa += vhrToSA; oa += (vcVhrAmtEff - vhrToSA);
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

    // Interest (mid-year average-balance convention)
    const _band = (mcVariance / 100);
    const _rand = rng ?? Math.random;
    const rateNoise = randomiseRates ? (_rand() * _band * 2 - _band) : 0;
    const rOA = _oaRateBase + rateNoise;
    const rSA = _saRateBase + rateNoise;
    const rMA = _maRateBase + rateNoise;
    const rRA = _saRateBase + rateNoise; // RA earns same base as SA (Item 5)
    const oaAvg = (oaOpen + oa) / 2;
    const saAvg = (saOpen + sa) / 2;
    const maAvg = (maOpen + ma) / 2;
    const raAvg = (raOpen + ra) / 2;
    let b1ToSA = 0, b1ToMA = 0, b1ToRA = 0, b2ToRA = 0, b2ToMA = 0;
    if (age < 55) {
      const oaP1 = Math.min(oaAvg, 20000); const rem1 = Math.max(0, 60000 - oaP1);
      const saP1 = Math.min(saAvg, rem1);   const maP1 = Math.min(maAvg, Math.max(0, rem1 - saP1));
      b1ToSA = (oaP1 + saP1) * CPF_RATES.EXTRA_1; b1ToMA = maP1 * CPF_RATES.EXTRA_1;
    } else {
      const raP1 = Math.min(raAvg, 60000);  const rem1 = Math.max(0, 60000 - raP1);
      const oaP1 = Math.min(oaAvg, Math.min(20000, rem1)); const maP1 = Math.min(maAvg, Math.max(0, rem1 - oaP1));
      b1ToRA = (raP1 + oaP1) * CPF_RATES.EXTRA_1; b1ToMA = maP1 * CPF_RATES.EXTRA_1;
      const raP2 = Math.min(raAvg, 30000);  const rem2 = Math.max(0, 30000 - raP2);
      const oaP2 = Math.min(oaAvg, Math.min(20000, rem2)); const maP2 = Math.min(maAvg, Math.max(0, rem2 - oaP2));
      b2ToRA = (raP2 + oaP2) * CPF_RATES.EXTRA_2; b2ToMA = maP2 * CPF_RATES.EXTRA_2;
    }
    const yearTotalInterest = (oaAvg * rOA) + (saAvg * rSA) + (maAvg * rMA) + (raAvg * rRA) + b1ToSA + b1ToMA + b1ToRA + b2ToRA + b2ToMA;
    // D4 Phase 2: scale first-year interest by firstYearFraction.
    const yearFraction = (age === startAge) ? firstYearFraction : 1.0;
    totalInterest += yearTotalInterest * yearFraction;
    yearOaInterest   = Math.round(oaAvg * rOA * yearFraction);
    yearMaInterest   = Math.round((maAvg * rMA + b1ToMA + b2ToMA) * yearFraction);
    yearSaRaInterest = Math.round(yearTotalInterest * yearFraction) - yearOaInterest - yearMaInterest;
    const yearRaInterest = (age >= 55 ? (raAvg * rRA) + b1ToRA + b2ToRA : (saAvg * rSA) + b1ToSA) * yearFraction;
    cumRaInterest += yearRaInterest;
    oa += oaAvg * rOA * yearFraction; sa += saAvg * rSA * yearFraction; ra += raAvg * rRA * yearFraction; ma += maAvg * rMA * yearFraction;
    if (age < 55) { sa += b1ToSA * yearFraction; ma += b1ToMA * yearFraction; } else { ra += (b1ToRA + b2ToRA) * yearFraction; ma += (b1ToMA + b2ToMA) * yearFraction; }
    if (age >= 55 && sa > 0) { ra += sa; sa = 0; } // B6: SA is closed from 55 — interest accrued before closure is credited to RA
    // ── Post-depletion / post-migration RA clamp ──────────────────────────────
    // (1) RSS depletion: ra = 0, redirect OA-sourced extra interest back to OA.
    // (2) CPF LIFE migration (years AFTER the migration year): RA premium is now with
    //     CPF Board. Standard/Escalating: member holds no personal RA, set ra = 0.
    //     Basic: ra mirrors the depleting migRaRem retained reserve.
    //     In all cases, redirect OA-sourced bonus interest (b1ToRA/b2ToRA) to OA.
    if (rssDepletionHit) {
      oa += b1ToRA + b2ToRA; ra = 0;
    } else if (migrationActivated) {
      oa += b1ToRA + b2ToRA;
      ra = lifePlanKey === 'bas' ? Math.max(0, migRaRem) : 0;
    }

    // Outflows: housing — CPF mortgage debits OA (tracked for CPF refund on sale);
    //                    Cash mortgage debits private assets only (no OA, no refund obligation).
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
      // No housing withdrawal this year — compound prior cumHousingFV at 2.5%/yr
      cumHousingFV = cumHousingFV * 1.025;
    }

    // DPS — Dependants' Protection Scheme: annual OA deduction (SA/RA fallback), SC/PR only, age 21–64
    // auto: use getDpsPremiumForAge(age) so premium steps up correctly as member ages each year
    if (!isForeigner && age >= 21 && age < 65 && _dpsMode !== 'optout') {
      const dpsPrem = _dpsMode === 'auto' ? getDpsPremiumForAge(age) : (Number(inputs.dpsAnnualPremium) || 0);
      if (dpsPrem > 0) {
        const fromOA = Math.min(oa, dpsPrem); oa -= fromOA;
        const rem = dpsPrem - fromOA;
        if (rem > 0) { if (age < 55) sa = Math.max(0, sa - rem); else ra = Math.max(0, ra - rem); }
      }
    }
    // HPS — Home Protection Scheme: annual OA deduction, SC/PR only, ends at min(65, housingStop)
    if (!isForeigner && _hpsAnnual > 0 && age < Math.min(65, housingStop)) {
      oa = Math.max(0, oa - _hpsAnnual);
    }

    // Property sale refund
    if (sellPropertyAge > 0 && age === sellPropertyAge && !refundApplied) {
      const totalRefund = Math.round(cumHousingFV);
      oa += totalRefund; yearInflow += totalRefund; totalInjected += totalRefund; yearVoluntary += totalRefund;
      if (usePropertyPledge) {
        const yrsSince2026 = Math.max(0, (baseYear + (age - startAge)) - 2026);
        const projFRSNow   = Math.round(projectedSum('FRS', rsGrowth, yrsSince2026));
        const transferToRA = Math.min(Math.max(0, projFRSNow - ra), oa);
        if (transferToRA > 0) { oa -= transferToRA; ra += transferToRA; }
      }
      currentPropValue = 0; refundApplied = true;
    }

    // Medical outflow — CareShield Life (elderCareShieldAmt) only begins at age 30 per MOH policy
    const yrSince = Math.max(0, age - startAge);
    const totalMaOut = Math.round((baseMedical + (age >= 30 ? elderCareShieldAmt : 0)) * Math.pow(1 + medInfl, yrSince));
    ma = Math.max(0, ma - totalMaOut); yearMedOut = totalMaOut;
    totalOutSpent += activeHousing + totalMaOut;

    // OA drawdown
    if (oaDrawdownActive && age >= oaDrawdownStartAge) {
      const actualDraw = Math.min(oaDrawdownAnnual, Math.max(0, oa - oaDrawdownFloor));
      oa = Math.max(oaDrawdownFloor, oa - actualDraw); yearOaDrawOut = actualDraw; totalOutSpent += actualDraw;
    }

    // Education loan
    if (oaEduLoanAnnual > 0) {
      const effEduFreq = oaEduLoanFreq === 'one-time' && !isFirstYear ? 0 : (oaEduLoanDur > 0 && yearIdx >= oaEduLoanDur) ? 0 : 1;
      if (effEduFreq > 0) {
        const projFRS_edu = Math.round(projectedSum('FRS', rsGrowth, Math.max(0, (baseYear + (age - startAge)) - 2026)));
        if (!(age >= 55 && ra < projFRS_edu)) {
          const eduCap = Math.max(0, (oa + cumEduOut) * 0.40 - cumEduOut);
          const actualEduLoan = Math.min(oaEduLoanAnnual * effEduFreq, eduCap, oa);
          oa = Math.max(0, oa - actualEduLoan); cumEduOut += actualEduLoan; yearEduOut = actualEduLoan; totalOutSpent += actualEduLoan;
        }
      }
    }

    // Property monetisation
    if (propMonetiseEnabled && age === propMonetiseAge && !propMonetiseApplied) {
      privateAssets += propMonetiseCash;
      if (propMonetiseRaTopup > 0 && !isForeigner) { ra += propMonetiseRaTopup; cumRaCashTopUps += propMonetiseRaTopup; yearInflow += propMonetiseRaTopup; totalInjected += propMonetiseRaTopup; yearVoluntary += propMonetiseRaTopup; }
      currentPropValue = Math.max(0, currentPropValue - propMonetiseCash - propMonetiseRaTopup);
      propMonetiseApplied = true;
    }
    // LBS ongoing monthly payout — HDB pays from propMonetiseAge until lbsPayoutEndAge
    if (_lbsMonthlyRSS > 0 && age >= propMonetiseAge && age <= _lbsEndAgeRSS) {
      const lbsAnnual = _lbsMonthlyRSS * 12;
      privateAssets += lbsAnnual; yearInflow += lbsAnnual; totalInjected += lbsAnnual;
    }
    // Rental income — recurring cash inflow from property rental
    if (_rentalMonthlyRSS > 0 && _rentalStartRSS > 0 && age >= _rentalStartRSS && age <= _rentalEndRSS) {
      const rentalAnnual = _rentalMonthlyRSS * 12;
      privateAssets += rentalAnnual; yearInflow += rentalAnnual; totalInjected += rentalAnnual;
    }
    // Rent expense — recurring private cash outflow (tenant paying rent)
    if (_rentExpMonthlyRSS > 0 && _rentExpStartRSS > 0 && age >= _rentExpStartRSS && age <= _rentExpEndRSS) {
      const rentExpAnnual = _rentExpMonthlyRSS * 12;
      privateAssets -= rentExpAnnual; yearRentExpOut += rentExpAnnual; totalOutSpent += rentExpAnnual;
    }

    // B1: Property value — Bala Curve model for leasehold; pure market growth for freehold.
    // Leasehold: propValue = freeholdEquiv × (1+growth)^yrsSinceStart × balaRatio(leaseRemaining)
    // Freehold:  propValue = propValue × (1 + growth)  [unchanged from prior model]
    if (!refundApplied) {
      leaseRemaining = Math.max(0, totalLease - yrSince);
      if (isLeasehold) {
        const mktFactor = Math.pow(1 + propGrowth, yrSince + 1);
        currentPropValue = Math.max(0, Math.round(freeholdEquiv * mktFactor * balaRatio(leaseRemaining)));
      } else {
        currentPropValue = Math.max(0, Math.round(currentPropValue * (1 + propGrowth)));
      }
    }
    for (const ev of leMedicalEvents) {
      const amt = Number(ev.magnitude) || 0; if (amt <= 0) continue;
      const src = ev.drawSource || 'oa_then_private'; let actualOut = 0;
      if (src === 'oa') { const fromOA = Math.min(amt, Math.max(0, oa)); oa = Math.max(0, oa - fromOA); actualOut = fromOA; }
      else if (src === 'private') { const fromPriv = Math.min(amt, Math.max(0, privateAssets)); privateAssets = Math.max(0, privateAssets - fromPriv); actualOut = fromPriv; }
      else { const fromOA = Math.min(amt, Math.max(0, oa)); oa = Math.max(0, oa - fromOA); const rem = amt - fromOA; const fromPriv = Math.min(rem, Math.max(0, privateAssets)); privateAssets = Math.max(0, privateAssets - fromPriv); actualOut = fromOA + fromPriv; }
      yearEventsOut += actualOut; totalOutSpent += actualOut;
    }
    for (const ev of leWindfallEvents) {
      const amt = Number(ev.magnitude) || 0; if (amt <= 0) continue;
      const dest = ev.destination || 'private'; let actualCredited = 0;
      if (dest === 'private') { privateAssets += amt; actualCredited = amt; }
      else if (dest === 'oa') { const room = Math.max(0, ANNUAL_LIMIT - (yearMandatory + yearVoluntary)); const actualOA = Math.min(amt, room); oa += actualOA; yearVoluntary += actualOA; actualCredited = actualOA; }
      else if (dest === 'srs') { const actualSRS = Math.min(amt, srsCap); srsBalance += actualSRS; actualCredited = actualSRS; }
      yearEventsIn += actualCredited; yearInflow += actualCredited; totalInjected += actualCredited;
    }
    // ── NEW EVENT TYPES (gap-analysis pass) ────────────────────────────────
    // Marriage: one-time OA credit (housing grant routed into OA at marriage age)
    if (leMarriageEvent) {
      const grantAmt = Number(leMarriageEvent.magnitude) || 0;
      if (grantAmt > 0 && !isForeigner) {
        oa += grantAmt;
        yearEventsIn += grantAmt; yearInflow += grantAmt; totalInjected += grantAmt;
      }
    }
    // Child birth: one-time inflow to private assets (Baby Bonus cash gift equivalent)
    if (leChildBirth) {
      const babyBonus = Number(leChildBirth.magnitude) || 0;
      if (babyBonus > 0) {
        privateAssets += babyBonus;
        yearEventsIn += babyBonus; yearInflow += babyBonus; totalInjected += babyBonus;
      }
    }
    // Loan repayments: monthly repayment × 12 deducted from private assets per year
    for (const ev of leLoanEvents) {
      const monthlyRep = Number(ev.magnitude) || 0; if (monthlyRep <= 0) continue;
      const annualRep  = monthlyRep * 12;
      const actual = Math.min(annualRep, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual);
      yearEventsOut += actual; totalOutSpent += actual;
    }
    // Parent / family support: monthly amount × 12 deducted from private assets per year
    for (const ev of leParentSupport) {
      const monthlyAmt = Number(ev.magnitude) || 0; if (monthlyAmt <= 0) continue;
      const annualAmt  = monthlyAmt * 12;
      const actual = Math.min(annualAmt, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual);
      yearEventsOut += actual; totalOutSpent += actual;
    }
    // Education expenses: annual tuition / enrichment / university cost per child
    for (const ev of leEducation) {
      const annualCost = Number(ev.magnitude) || 0; if (annualCost <= 0) continue;
      const actual = Math.min(annualCost, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual);
      yearEventsOut += actual; totalOutSpent += actual;
    }
    // Charitable donations: annual amount deducted from private assets.
    // 250% IRAS tax deduction benefit is credited back as a cash return
    // (simplification: 2.5× the donation reduces taxable income → modelled as a
    // partial cash refund = donation × effectiveTaxRate × 2.5, credited to private assets).
    for (const ev of leDonation) {
      const annualDonation = Number(ev.magnitude) || 0; if (annualDonation <= 0) continue;
      const actual = Math.min(annualDonation, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actual);
      yearEventsOut += actual; totalOutSpent += actual;
      // Approximate 250% IPC deduction benefit — deduction = 2.5 × donation, at marginal rate
      const donationMargRate = (Number(inputs.budgetTaxRate) || 0) / 100;
      if (donationMargRate > 0) {
        const taxSaving = Math.round(Math.min(annualDonation, annualGrossSalary) * 2.5 * donationMargRate);
        privateAssets += taxSaving;
        yearEventsIn += taxSaving; yearInflow += taxSaving; totalInjected += taxSaving;
      }
    }
    // Structural inputs: loan repayment + parent support from dedicated input fields
    // (separate from Life Event entries — these run for the configured age ranges)
    const _loanMonthly    = Number(inputs.loanMonthlyRepayment) || 0;
    const _loanEndAge     = Number(inputs.loanEndAge) || 55;
    if (_loanMonthly > 0 && age <= _loanEndAge) {
      const annualLoan = _loanMonthly * 12;
      const actualLoan = Math.min(annualLoan, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actualLoan);
      yearEventsOut += actualLoan; totalOutSpent += actualLoan;
    }
    const _parentMonthly  = Number(inputs.parentSupportMonthly) || 0;
    const _parentEndAge   = Number(inputs.parentSupportEndAge) || 75;
    if (_parentMonthly > 0 && age <= _parentEndAge) {
      const annualParent = _parentMonthly * 12;
      const actualParent = Math.min(annualParent, Math.max(0, privateAssets));
      privateAssets = Math.max(0, privateAssets - actualParent);
      yearEventsOut += actualParent; totalOutSpent += actualParent;
    }
    // Marriage housing grant from dedicated inputs (if not already added via Life Event)
    const _marriageAge    = Number(inputs.marriageAge) || 0;
    const _housingGrant   = Number(inputs.housingGrantAmount) || 0;
    if (_marriageAge > 0 && age === _marriageAge && _housingGrant > 0 && !isForeigner && !leMarriageEvent) {
      oa += _housingGrant;
      yearEventsIn += _housingGrant; yearInflow += _housingGrant; totalInjected += _housingGrant;
    }
    // Children education costs from childrenData array
    const _childrenData   = inputs.childrenData || [];
    for (const child of _childrenData) {
      const childStart = Number(child.startAge) || 0;
      const childEnd   = Number(child.endAge)   || 0;
      const childCost  = Number(child.annualCost) || 0;
      if (childStart > 0 && childEnd > 0 && childCost > 0 && age >= childStart && age <= childEnd) {
        const actualChild = Math.min(childCost, Math.max(0, privateAssets));
        privateAssets = Math.max(0, privateAssets - actualChild);
        yearEventsOut += actualChild; totalOutSpent += actualChild;
      }
    }
    // Fires exactly once at age === migrationAge (when configured and not yet activated).
    // After migration, the payout source switches from RSS drawdown to CPF LIFE annuity.
    // The 20% RA-to-OA transfer is applied here inside the engine (not in the external
    // raOaTransfer useMemo, which is bypassed for all RSS members via the _isRSSForTransfer
    // guard added in PR-1). This avoids double-applying the transfer.
    if (migrationAge > 0 && age === migrationAge && !migrationActivated) {
      if (ra >= 60000) {
        // Step 1: Apply birth-year-gated RA-to-OA transfer on the eligible base.
        // Eligible base excludes only cash top-ups, OA→RA transfers, and gov grants — NOT interest.
        // Born 1958+: 20% of eligible base − $5,000; Born 1957: 10%; Born ≤1956: not eligible.
        // applyRaOaTransfer toggle: OFF (default) skips the transfer so projections stay unchanged;
        // ON applies the policy-accurate transfer, reducing RA and boosting OA at migration age.
        const migBirthYear      = (Number(inputs.birthYear) > 0) ? Number(inputs.birthYear) : (baseYear - startAge); // exact when birthYear set; else approximate (±1yr)
        const migRaTransferBase = Math.max(0, ra - cumRaCashTopUps);
        const migTransferPct    = migBirthYear >= 1958 ? 0.20 : migBirthYear === 1957 ? 0.10 : 0;
        const migRaTransferRaw  = Math.round(migRaTransferBase * migTransferPct);
        const migRaOaTransfer   = migBirthYear >= 1958 ? Math.max(0, migRaTransferRaw - 5000) : migRaTransferRaw;
        if (inputs.applyRaOaTransfer && migRaOaTransfer > 0) {
          oa += migRaOaTransfer;
          ra -= migRaOaTransfer;
        }
        // Step 2: Compute CPF LIFE payout for the chosen plan from remaining RA at current age.
        // interpolateCpfLife supports 'std', 'esc', and 'bas' — lifePlanKey selects the correct table.
        postMigrationMonthly = Math.round(interpolateCpfLife(ra, lifePlanKey, isMaleRSS, age));
        // Step 3: Initialise Basic Plan state — only needed when lifePlanKey === 'bas'.
        // Gated to avoid wasteful computation for Standard and Escalating migrations.
        if (lifePlanKey === 'bas') {
          const migPhase1aMonthly = postMigrationMonthly; // already 'bas' lookup above
          const migParams = computeBasicPlanParams(ra, age, migPhase1aMonthly, 10);
          migRaRem          = migParams.pv;
          migPhase1bTrigger = migParams.phase1bTrigger;
          migPhase1bActualTrigger = migParams.phase1bTrigger; // B2: runtime tracker starts at pre-computed value
          migPhase1aAnnual  = migParams.phase1aAnnual;
          migPhase2Annual   = migParams.phase2Annual;
          migEffAnnualFactor = migParams.effAnnualFactor;
        }
        migYearsSince      = 0; // escalating plan counter starts at migration year
        migrationActivated = true;
        // RA has just become the CPF LIFE premium. Set ra immediately so the migration
        // year's data.push() records the correct post-migration RA balance, not the
        // pre-migration balance that has already had interest added.
        // Standard/Escalating: premium is pooled — member holds $0 personal RA.
        // Basic: RA_Retained reserve (migRaRem) remains accessible to the member.
        ra = lifePlanKey === 'bas' ? Math.max(0, migRaRem) : 0;
      } else {
        // RA < $60,000: CPF LIFE requires at least $60k — migration deferred/skipped.
        // Flag is set so the UI can surface this as a warning.
        migrationRaWarning = true;
      }
    }

    // ── PAYOUT DEBIT — RSS drawdown OR CPF LIFE post-migration ───────────────
    if (migrationActivated && age >= migrationAge) {
      // ── POST-MIGRATION: CPF LIFE payout — plan-specific mechanics ─────────
      // RA does NOT deplete for Standard and Escalating (pool annuity — longevity risk shared).
      // Basic plan retains a portion of RA (migRaRem) that self-funds Phase 1A/1B payouts.
      let annualLifePayout;
      if (lifePlanKey === 'esc') {
        // Escalating: 2%/yr compounding from the migration year (CPF LIFE Escalating plan)
        annualLifePayout = Math.round(postMigrationMonthly * 12 * Math.pow(1.02, migYearsSince));
        migYearsSince++;
      } else if (lifePlanKey === 'bas') {
        // Basic: two-phase payout — Phase 1A (higher), Phase 2 (lower after RA_Retained depletes)
        // B2 fix: update actual trigger if balance drops below $60k before pre-computed trigger age.
        if (migRaRem < 60000 && age < migPhase1bActualTrigger) migPhase1bActualTrigger = age;
        const { basPay, newRaRem } = computeBasicPlanYearPayout(
          age, migPhase1bActualTrigger, migPhase1aAnnual, migPhase2Annual, migRaRem, migEffAnnualFactor
        );
        annualLifePayout = basPay;
        migRaRem = newRaRem;
      } else {
        // Standard: fixed monthly for life (CPF Board default)
        annualLifePayout = postMigrationMonthly * 12;
      }
      rssPayoutThisYear = annualLifePayout;   // reuse field — labelled in tab as "CPF LIFE payout"
      totalOutSpent += annualLifePayout;
      // Sync ra to post-payout reality. migRaRem is freshly updated for Basic;
      // Standard/Escalating remain at 0 (defensive — the clamp above handles interest years,
      // but this ensures the payout year row is also correct).
      ra = lifePlanKey === 'bas' ? Math.max(0, migRaRem) : 0;
    } else if (rssAnnualPayout > 0 && age >= rssPayoutStart && !rssDepletionHit) {
      // ── PRE-MIGRATION (or no migration): RSS fixed drawdown from RA ──────────
      const actualPayout = Math.min(rssAnnualPayout, Math.max(0, ra));
      ra               = Math.max(0, ra - actualPayout);
      rssPayoutThisYear = actualPayout;
      totalOutSpent   += actualPayout;
      if (ra <= 0 && rssDepletionAge === null) {
        rssDepletionAge = age;
        rssDepletionHit = true;
      }
    }
    // Propagate depletion age forward — every subsequent row carries the value
    // so consumers can read it from the last row without a scan.

    data.push({
      age,
      oa: Math.round(oa), sa: Math.round(sa),
      ma: Math.round(ma), ra: Math.round(ra),
      total: Math.round(oa + sa + ma + ra),
      propertyValue: Math.round(currentPropValue),
      privateAssets: Math.round(privateAssets),
      srsBalance:    Math.round(srsBalance),
      interest:      Math.round(yearTotalInterest),
      injected:      Math.round(yearInflow),
      outflow: Math.round(yearHousingOut + yearMedOut + yearOaDrawOut + yearCpfisOut + yearEduOut + yearLovedOneOut + yearEventsOut + yearRentExpOut + rssPayoutThisYear),
      cumulativeInjected:  Math.round(totalInjected),
      cumulativeInterest:  Math.round(totalInterest),
      cumulativeOutflow:   Math.round(totalOutSpent),
      cumRaCashTopUps:     Math.round(cumRaCashTopUps),
      cumRaInterest:       Math.round(cumRaInterest),
      yearMandatory:  Math.round(yearMandatory),
      yearVoluntary:  Math.round(yearVoluntary),
      yearGovGrants:  Math.round(yearGovGrants),
      yearOaInterest, yearSaRaInterest, yearMaInterest,
      yearHousingOut: Math.round(yearHousingOut),
      yearMedOut:     Math.round(yearMedOut),
      yearOaDrawOut:  Math.round(yearOaDrawOut),
      yearLovedOneOut:Math.round(yearLovedOneOut),
      yearCpfisOut:   Math.round(yearCpfisOut),
      yearEduOut:     Math.round(yearEduOut),
      yearRentExpOut: Math.round(yearRentExpOut),
      yearEventsIn:   Math.round(yearEventsIn),
      yearEventsOut:  Math.round(yearEventsOut),
      yearPrivDrawOut:Math.round(yearPrivDrawOut),
      yearWisCash:    Math.round(yearWisCash),
      cumHousingFV:   Math.round(cumHousingFV),
      activeEventTypes:     activeEvents.map(e => e.type),
      activeHyperinflation: leHyperinflation ? Number(leHyperinflation.magnitude) || 0 : 0,
      // ── RSS-specific fields (ignored by CPF LIFE consumers — extra keys are harmless) ──
      rssPayoutThisYear: Math.round(rssPayoutThisYear),
      rssDepletionAge,                         // null until first depletion year; integer age thereafter
      migrationActivated,                      // false pre-migration; true from migrationAge onward
      postMigrationPayout: postMigrationMonthly, // monthly CPF LIFE payout post-migration (0 if no migration)
      migrationRaWarning,                      // true if RA was < $60k at migration age
    });
  }
  return data;
}
