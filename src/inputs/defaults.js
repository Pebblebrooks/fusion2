/**
 * Input model: defaults, labels, schema migration and input sanitising.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// ── Schema versioning ────────────────────────────────────────────────────────────────────
// Increment CURRENT_SCHEMA_VERSION on every breaking DEFAULT_INPUTS field rename.
// migrateProfile() applies forward migrations on JSON import so old profiles load correctly.
export const CURRENT_SCHEMA_VERSION = 5;

export const migrateProfile = (raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  let p = { ...raw };
  const v = p._schemaVersion || 3;
  if (v < 4) {
    p = { ...p, inputs: { ...p.inputs,
      // Field renames: old name ?? new name ?? fallback
      rentExpense:     p.inputs?.rentExpense     ?? p.inputs?.rentalExpenseMonthly  ?? 0,
      rentExpStartAge: p.inputs?.rentExpStartAge ?? p.inputs?.rentalExpenseStartAge ?? 0,
      rentExpEndAge:   p.inputs?.rentExpEndAge   ?? p.inputs?.rentalExpenseStopAge  ?? 85,
      // Defaults for fields added in v4 (Phase 2 fields — silently dropped by buildSafeInputs
      // if they are not yet in DEFAULT_INPUTS; they become active once Phase 2 adds them)
      hasAMD:                     p.inputs?.hasAMD                     ?? false,
      hasACP:                     p.inputs?.hasACP                     ?? false,
      cpfWithdrawalLock:          p.inputs?.cpfWithdrawalLock          ?? false,
      cpfMoneyLock:               p.inputs?.cpfMoneyLock               ?? false,
      cpfSafetySwitch:            p.inputs?.cpfSafetySwitch            ?? false,
      cpfTrustContactSet:         p.inputs?.cpfTrustContactSet         ?? false,
      otherLiabilities:           p.inputs?.otherLiabilities           ?? 0,
      secondaryEmploymentEnabled: p.inputs?.secondaryEmploymentEnabled ?? false,
      secondaryEmploymentType:    p.inputs?.secondaryEmploymentType    ?? 'employed',
      secondarySalaryGross:       p.inputs?.secondarySalaryGross       ?? 0,
      secondaryAnnualBonus:       p.inputs?.secondaryAnnualBonus       ?? 0,
      secondaryCitizenStatus:     p.inputs?.secondaryCitizenStatus     ?? 'SC',
      secondaryPrYear:            p.inputs?.secondaryPrYear            ?? 3,
      secondaryContribStopAge:    p.inputs?.secondaryContribStopAge    ?? 65,
      cpfHousingLoanPrincipal:    p.inputs?.cpfHousingLoanPrincipal    ?? 0,
      showBalaCurve:              p.inputs?.showBalaCurve              ?? false,
      showLifeStageBanner:        p.inputs?.showLifeStageBanner        ?? true,
      shsEnabled:                 p.inputs?.shsEnabled                 ?? false,
      shsFromFlat:                p.inputs?.shsFromFlat                ?? '5r',
      shsToFlat:                  p.inputs?.shsToFlat                  ?? '3r',
      shsAge:                     p.inputs?.shsAge                     ?? 65,
      // M5: property classification — remap old generic 'hdb' value to granular 'hdb_bto'
      propertyIntention: p.inputs?.propertyIntention ?? (p.inputs?.propertyType === 'none' ? 'none' : 'own'),
      monthlyRentExpense: p.inputs?.monthlyRentExpense ?? 0,
      propertyType:  (p.inputs?.propertyType === 'hdb' ? 'hdb_bto' : p.inputs?.propertyType) ?? 'hdb_bto',
      propertyAge:   p.inputs?.propertyAge   ?? 0,
      loanType:      p.inputs?.loanType      ?? 'hdb',
      mortgagePaymentSource: p.inputs?.mortgagePaymentSource ?? 'cpf',
    }};
  }
  // v5: strip legacy life event types removed from LIFE_EVENT_TYPES
  // (marriage, loan_repayment, parent_support → superseded by dedicated Family Milestones fields)
  // Old profiles with these types would show blank label/colour on the timeline.
  if (v < 5) {
    p = { ...p, inputs: { ...p.inputs,
      lifeEvents: (p.inputs?.lifeEvents || []).filter(
        ev => !['marriage', 'loan_repayment', 'parent_support'].includes(ev?.type)
      ),
    }};
  }
  p._schemaVersion = CURRENT_SCHEMA_VERSION;
  return p;
};

export const DEFAULT_INPUTS = {
  name: "", currentAge: 35, currentYear: 2026, payoutAge: 65,
  contributionStopAge: 65, housingStopAge: 55,
  isSelfEmployed: false, isMale: true, netTradeIncome: 0,
  oaBalance: 50000, saBalance: 40000, maBalance: 30000,
  showSalaryCalc: false, salaryGross: 6000, salaryBonus: 12000, salaryGrowthRate: 0,
  // Rev #22: phased salary (career break moved to Life Events — see LIFE_EVENT_TYPES.career_break)
  salaryPhaseAge: "", salaryGrowthRate2: 0,
  empOaCont: 12000, empSaCont: 4000, empMaCont: 4000,
  // VC3A: single cash lump-sum, auto-split by age-band allocation rates
  vc3aCash: 0,
  // RSTU: cash top-up to SA (pre-55) or RA (post-55)
  vcSaTopup: 0,
  // Housing refund: credited to OA (VHR)
  vcVhr: 0,
  // Gov grants / MRSS / MMSS / WIS
  annualGovGrant: 0, // was 500: there is no universal yearly grant; enter one only if you receive it
  govGrantMa: 0,               // Gov grants to MA (e.g. MediSave Grant for Newborns $5,000, CHAS, ElderFund). BHS-capped.
  mrssGrant: 0,               // MRSS: govt matches RSTU RA top-up, up to $2,000/yr (lifetime cap $20,000), age 55+, RA below BRS
  mmssGrant: 0,               // MMSS: govt matches MA top-up, up to $1,000/yr, age 55-70
  wisAmount: 0,               // WIS: Workfare Income Supplement — 60% CPF (age-band), 40% cash (employees); 90% MA (SEP)
  // CPF Transfers
  oaToSaTransfer: 0,          // annual OA→SA transfer before 55
  oaToMaTransfer: 0,          // annual OA→MA transfer
  // Age 55 options
  oaWithdrawalAt55: 0,
  usePropertyPledge: false,
  pledgeWithdrawalAmount: 0,    // amount to withdraw from RA (pledged sum) as cash
  pledgeWithdrawalAge: 55,      // age at which member applies to withdraw pledged RA funds
  // CPFIS
  cpfisOaAmount: 0,    // Annual CPFIS investment from OA (OA must be > $20,000)
  cpfisSaAmount: 0,    // Annual CPFIS investment from SA (SA must be > $40,000, pre-55 only)
  // Outflows
  housingOutflow: 12000, oaEduLoan: 0, oaEduLoanFreq: 'one-time',
  mortgagePaymentSource: 'cpf',   // 'cpf' | 'cash' — gates engine debit: OA vs private assets
  propertyIntention: 'own',       // 'own' | 'rent_out' | 'renting' | 'none' — gates which property inputs are shown
  monthlyRentExpense: 0,          // monthly rent paid to landlord (renting intent only) — debits private assets
  propertyType: 'hdb_bto',        // 'hdb_bto' | 'hdb_resale' | 'private' | 'none' — gates leasehold auto-set + grant UI
  propertyAge:  0,                // age of property in years (HDB resale / private); auto-computes remaining lease
  loanType: 'hdb',               // 'hdb' | 'bank' | 'none' — informational; gates loan-type label
  medicalUsage: 500, medishieldIP: 900, medishieldMode: 'manual', elderCareShield: 500,
  medicalInflationRate: 5,
  propertyValue: 500000, propertyGrowthRate: 2, propertyLeasehold: false, propertyLeaseYears: 99,
  propertyGoalValue: 0,       // optional target property value at payout age (0 = no goal; shows % of net worth instead)
  inflationRate: 2, includeProperty: true, maxProjectionAge: 95,
  cpfOARateOverride: '', cpfSARateOverride: '', cpfMARateOverride: '', // '' = use CPF_RATES defaults; set to a number (e.g. 1.5) for Stress Centre override
  sellPropertyAge: 0,
  // Private Assets & Goals
  targetMonthlyIncome: 3000,   // sensible SGD baseline — users can adjust in the Retirement section
  currentPrivateAssets: 0,
  annualPrivateSaving: 0,
  privateAssetGrowthRate: 0,
  privateAssetGoal: 0,        // optional target private asset value at payout age (0 = no goal; shows % of net worth instead)
  goalTargetCPF: 0,           // Goal Simulator: desired total CPF balance at payout age (0 = no goal set)
  plannedDownpaymentOA: 0,
  downpaymentAge: 35,
  // Housing Grants — one-time OA credits at downpaymentAge, all included in cumHousingOA for CPF refund tracking
  ehgAmount: 0,               // Enhanced CPF Housing Grant (up to $120k families / $60k singles)
  cpfHousingGrantResale: 0,   // CPF Housing Grant for Resale Flats (up to $80k families / $40k singles)
  phgAmount: 0,               // Proximity Housing Grant (up to $30k / $20k)
  stepUpGrantAmount: 0,       // Step-Up CPF Housing Grant (up to $15k second-timers)
  // Insurance — annual OA deductions
  dpsMode: "auto",             // "auto"|"optout"|"custom" — how DPS premium is determined
  dpsAnnualPremium: 0,        // Dependants' Protection Scheme — only read when dpsMode === "custom"
  hpsAnnualPremium: 0,        // Home Protection Scheme (HDB owners only, ends at min(65, housingStop))
  // OA Drawdown (post-payout-age supplementary income from OA)
  oaDrawdownStartAge: 0,         // 0 = disabled; age to begin drawing from OA (must be >= payoutAge)
  oaDrawdownMonthly: 0,          // monthly cash draw from OA (in addition to CPF LIFE)
  oaDrawdownFloor: 0,            // minimum OA balance to preserve (bequest floor); draw stops when OA hits this
  // SRS rising equity glidepath (Sprint-5 Item 23)
  srsGlidepathEnabled:        false,  // when true, blended equity/bond return used during SRS drawdown
  srsGlidepathStartEquityPct: 30,     // % equities at drawdown start age (rises 2%/yr, capped 60%)
  srsGlidepathEquityReturn:    7,     // equity return assumption (% p.a.)
  srsBondReturn:               3,     // bond/conservative return assumption (% p.a.)
  // Property Monetisation
  propMonetiseEnabled: false,    // master toggle
  propMonetiseScheme: "downgrade", // "downgrade" | "lbs" | "shb"
  propMonetiseAge: 65,           // age at which the scheme event occurs (one-time)
  propMonetiseCashProceeds: 0,   // net cash received by member (after CPF refund, stamp duty etc.)
  propMonetiseRaTopup: 0,        // RA top-up component (Silver Housing Bonus CPF portion, or LBS annuity lump-sum)
  lbsMonthlyPayout: 0,          // LBS: monthly income HDB pays after lease buyback ($/mo); active from propMonetiseAge → lbsPayoutEndAge
  lbsPayoutEndAge: 85,           // LBS: age when monthly payout stream ends (when sold lease portion expires)
  // Rental Income — recurring cash inflow from property rental
  rentalIncome: 0,               // monthly rental income ($/mo)
  rentalStartAge: 0,             // 0 = disabled; age to start receiving rental income
  rentalEndAge: 85,              // age to stop receiving rental income
  rentExpense: 0,              // monthly rent paid as a tenant ($/mo); debited from private assets
  rentExpStartAge: 0,          // 0 = disabled; age to start paying rent
  rentExpEndAge: 85,           // age to stop paying rent
  // SRS (Supplementary Retirement Scheme)
  srsBalance: 0,
  srsAnnualContribution: 0,
  srsContribStopAge: 63,
  srsReturnRate: 4,
  srsDrawdownStartAge: 63,
  srsDrawdownYears: 10,
  // Die with Zero — fully deplete liquid assets by a target age
  dieWithZeroEnabled: false,
  dieWithZeroAge: 85,
  // ── Display toggles (no engine impact — not in engineKey) ─────────
  showBalaCurve:       false, // CPF Board cohort-avg overlay on Accumulation chart
  showLifeStageBanner: true,  // dismissible life-stage banner in Dashboard header
  // Cash top-up to MA (direct, annual, any age, capped at BHS)
  vcMaCash: 0,
  // OA→MA transfer destination: false = self (internal move), true = loved one (OA outflow only)
  oaToMaForLovedOne: false,
  // OA→SA/RA transfer destination: false = self (internal move), true = loved one (OA outflow only)
  oaToSaForLovedOne: false,
  // Frequency toggles — 'annual' (recurring each year) or 'one-time' (applied in first year only)
  vc3aFreq: 'annual', vcSaFreq: 'annual', vcMaFreq: 'annual', vcVhrFreq: 'annual',
  govGrantFreq: 'annual', govGrantMaFreq: 'annual', wisFreq: 'annual',
  cpfisOaFreq: 'annual', cpfisSaFreq: 'annual', housingFreq: 'annual',
  oaWithdrawalFreq: 'one-time', oaToMaFreq: 'annual', oaToSaFreq: 'annual',
  // Duration for recurring fields (0 = indefinite/∞; N = apply for first N projection years from current age).
  // Ignored when the paired *Freq is 'one-time' — one-time fields already fire only in year 1.
  // SRS excluded — its stop is controlled precisely by srsContribStopAge instead.
  vc3aDur: 0, vcSaDur: 0, vcMaDur: 0, vcVhrDur: 0,
  govGrantDur: 0, govGrantMaDur: 0, wisDur: 0,
  cpfisOaDur: 0, cpfisSaDur: 0, housingDur: 0,
  oaToMaDur: 0, oaToSaDur: 0, oaEduLoanDur: 0, oaWithdrawalDur: 0,
  // PR tenure year — 1, 2, or 3+ (3 = full rates). Only shown/relevant when citizenStatus === 'PR'.
  prYear: 3,
  // PR rate type — 'GG' (Graduated Employer + Graduated Employee, default) or
  // 'FG' (Full Employer + Graduated Employee, requires voluntary joint application).
  // Only applies when citizenStatus === 'PR' && prYear < 3. Year 3+ always uses full SC/PR3+ rates.
  prRateType: 'GG',
  // Global citizenship status: 'SC' (Singapore Citizen) or 'PR' (Permanent Resident).
  // Gates MRSS, MMSS (SC only), and PR tenure contribution warnings.
  // Foreigners are not modelled — they have no CPF entitlements.
  citizenStatus: 'SC',
  // Person with Disabilities (PwD): unlocks MRSS eligibility below age 55.
  // PwD members with OA+SA below BRS qualify for MRSS from 2026 regardless of age.
  isPwD: false,
  // D4 Phase 2: birth month (1=Jan…12=Dec). Engine uses this to prorate the first
  // projection year's interest to the fraction remaining until the next birthday.
  // Default 6 (June) approximates the prior mid-year convention for legacy profiles.
  birthMonth: 6,
  // D4 Phase 3: birth year (4-digit, e.g. 1991). When set (> 0), currentAge is
  // auto-derived as (currentYear - birthYear) and the Age field becomes read-only.
  // Eliminates the currentAge / birthMonth inconsistency (Bug 7) and provides an
  // exact birth year for the CPF LIFE RA→OA transfer gate (1957/1958 boundary).
  // 0 = not set (manual age-entry mode, backward-compatible with legacy profiles).
  birthYear: 0,
  // applyRaOaTransfer: toggle whether the birth-year-gated RA→OA transfer fires in the engine
  // at payout age (non-RSS) or migration age (RSS). Default OFF preserves existing projections.
  // When ON: OA balance boosted, RA reduced, CPF LIFE payouts recalculated on post-transfer RA.
  applyRaOaTransfer: false,
  // Rev #5: Annual growth rate assumed for CPF retirement sums (FRS/BHS/BRS/ERS) projections.
  // CPF Board has historically raised these at ~3%/yr. Range: 0–10%; warn outside 0–6%.
  // Affects every projected FRS/BHS/BRS/ERS threshold in the engine and UI milestones.
  retirementSumGrowth: 3,
  // Rev #MC: Monte Carlo rate variance (±%). Controls the noise band applied to CPF interest
  // rates in each of the 500 simulation runs. Default 1% matches historical CPF rate stability.
  mcVariancePct: 1,
  // Rev #D2: Life Events — array of user-defined stress-test events overlaid on the projection.
  // Each event has: id, type, label, startAge, endAge, magnitude, enabled,
  // and optional type-specific fields: drawSource (medical_crisis), destination (windfall).
  lifeEvents: [],
  // ── RSS: Retirement Sum Scheme (pre-1958 members) ────────────────────────
  // cpfScheme: 'cpf_life' (default, born 1958 or after) | 'rss' (born before 1958).
  // Switching to 'rss' activates the runRSSEngine parallel path and shows the RSS tab.
  // All CPF LIFE logic, the LIFE tab, and runProjectionEngine are untouched.
  cpfScheme: 'cpf_life',
  // rssPayoutStartAge: age when CPF Board began RSS monthly drawdown (≥55, ≤currentAge).
  rssPayoutStartAge: 65,
  // rssMonthlyPayout: fixed monthly RSS payout amount as per CPF statement ($/month).
  rssMonthlyPayout: 0,
  // lifeMigrationAge: age to voluntarily migrate from RSS to CPF LIFE (0 = no migration).
  // lifePlanAtMigration: CPF LIFE plan chosen at the point of migration.
  //   'std' = Standard (fixed payout for life — CPF Board default)
  //   'esc' = Escalating (starts ~20% lower, rises 2%/yr — best long-run value)
  //   'bas' = Basic (lowest payout; RA retains a cash-refundable reserve)
  // Must be > currentAge and ≤ 80 (CPF policy deadline for migration).
  lifeMigrationAge: 0,
  lifePlanAtMigration: 'std',  // 'std' | 'esc' | 'bas' — CPF LIFE plan chosen at migration
  // Q2: Milestone Age — user-defined age marker on Grow chart + Summary callout.
  // 0 = disabled. A teal dashed line and balance card appear when set.
  // Useful for baby/minor profiles targeting age 21, 35, or 55.
  milestoneAge: 0,
  milestoneAge2: 0,
  milestoneAge3: 0,
  milestoneAge4: 0,
  milestoneAge5: 0,
  // ── Cash Budget: pre-retirement cashflow model ───────────────────────────
  // budgetLivingExpenses — monthly spend: rent, food, transport, dependants
  // budgetTaxRate        — marginal Singapore income tax rate (%)
  budgetLivingExpenses: 3000, budgetExpenseInflation: 2, budgetTaxOverride: false,
  budgetTaxRate: 0,
  // ── MAS Financial Health (Tier 2 advisory scores) ────────────────────────
  // emergencyFundMonths  — months of liquid savings set aside for emergencies (MAS: 3–6 months)
  // hasWill              — has a valid Will been prepared?
  // hasCPFNomination     — CPF nomination (CSNB) completed?
  // hasLPA               — Lasting Power of Attorney registered with OPG?
  emergencyFundMonths: 0,
  hasWill: false,
  hasCPFNomination: false,
  hasLPA: false,
  hasAMD: false,             // Advance Medical Directive filed with MOH
  hasACP: false,             // Advance Care Plan completed with a healthcare provider
  // ── CPF Safety Features (activate on CPF website — no engine impact) ──────
  cpfWithdrawalLock:  false, // Prevents OA/SA cash withdrawals before age 65
  cpfMoneyLock:       false, // Floor on OA/SA withdrawals
  cpfSafetySwitch:    false, // Temporary transaction freeze
  cpfTrustContactSet: false, // Nominated trusted person for large-transaction alerts
  otherLiabilities:   0,     // Outstanding liabilities (car loan, personal loan, etc.)
  // ── Protection Coverage (Q3 — Insurance Wellness Tile) ──────────────────────────────────
  // Non-CPF insurance held outside the DPS/HPS that the engine already tracks.
  // Used for the Protection Adequacy tile in the MAS Wellness Score panel.
  termLifeSumAssured:         0,   // $: existing term life + whole life sum assured (excl. DPS $70K/55K)
  criticalIllnessSumAssured:  0,   // $: CI sum assured from any CI or ECI policy
  hasISP:                     false, // bool: has Integrated Shield Plan (MediShield Life upgrade)

  // ── Retirement Spending Model ─────────────────────────────────────────────
  // Projects living-expense burn into the post-retirement phase so income-vs-
  // expense sustainability can be calculated alongside CPF LIFE / OA / SRS income.
  // retirementExpenseRatio    — % of current monthly expenses still needed in retirement
  //                            (default 75%: no work commute, mortgage often paid off,
  //                             but leisure / healthcare rises — net reduction ~25%)
  // retirementHealthcareMonthly — extra monthly healthcare budget post-payout age
  //                            (on top of the ratio-scaled living expenses)
  // healthcareEscalatorAge    — age when healthcare costs begin rising further
  //                            (default 75: typical onset of age-related conditions)
  // healthcareEscalatorAnnualIncrease — additional $/yr added to healthcare budget
  //                            each year after healthcareEscalatorAge (default $200/yr)
  retirementExpenseRatio:              75,
  retirementHealthcareMonthly:        500,
  healthcareEscalatorAge:              75,
  healthcareEscalatorAnnualIncrease:  200,

  // ── Investment / Brokerage Portfolio ──────────────────────────────────────
  // Tracks a financial portfolio separate from the illiquid-bucket privateAssets:
  // unit trusts, ETFs, REITs, stocks, dividend portfolios, SSBs, T-bills, fixed
  // deposits, robo-advisory accounts etc. Treated as a separately-compounding pool
  // that shows up as its own segment in the Net Worth Trajectory chart.
  // portfolioAnnualContribution  — annual injection (0 = none)
  // portfolioContribStopAge      — age to stop annual contributions (0 = at payoutAge)
  // portfolioWithdrawalMonthly   — monthly withdrawal after portfolioWithdrawalStartAge
  // portfolioWithdrawalStartAge  — age to begin systematic withdrawals (default = payoutAge)
  portfolioBalance:             0,
  portfolioAnnualReturn:        6,
  portfolioAnnualContribution:  0,
  portfolioContribStopAge:      0,
  portfolioWithdrawalMonthly:   0,
  portfolioWithdrawalStartAge:  0,   // 0 = use payoutAge

  // ── Loan / Debt Repayments ────────────────────────────────────────────────
  // Consolidated monthly outflow for active loans (car, personal, student, reno).
  // Modelled as a fixed monthly deduction from private assets / discretionary cash.
  // For multiple loans with different end dates, use individual Life Event entries
  // of type 'loan_repayment' instead — those support per-event start/end ages.
  loanMonthlyRepayment:   0,
  loanEndAge:             55,

  // ── Family / Parent Support ───────────────────────────────────────────────
  // Regular financial support to aging parents, dependants, or overseas remittances.
  parentSupportMonthly:   0,
  parentSupportEndAge:    75,

  // ── Marriage & Housing Grant ──────────────────────────────────────────────
  // One-off event: housing grant credited to OA at marriageAge.
  // Grant types (2026 rates): HDB Enhanced Housing Grant (EHG) up to $120k (income-tested);
  // Family Grant (FG) $30–50k for resale; Proximity Housing Grant (PHG) $10–20k.
  // Set marriageAge = 0 to disable; housingGrantAmount = total grant received.
  marriageAge:            0,
  housingGrantAmount:     0,

  // ── Secondary employment (dual / hybrid income) ───────────────────────────
  // Second income stream — stacked on top of primary by both RSS and PE engines.
  // Set secondaryEmploymentEnabled to true to activate; CPF calcs auto-stack.
  secondaryEmploymentEnabled: false,
  secondaryEmploymentType: 'employed',   // 'employed' | 'sep'
  secondarySalaryGross: 0,               // monthly gross OW ($)
  secondaryAnnualBonus: 0,               // annual bonus / AW ($)
  secondaryCitizenStatus: 'SC',
  secondaryPrYear: 3,
  secondaryContribStopAge: 65,

  // ── CPF housing loan ledger ────────────────────────────────────────────────
  cpfHousingLoanPrincipal: 0,

  // ── Silver Housing Bonus (SHB) ─────────────────────────────────────────────
  shsEnabled: false,
  shsFromFlat: '5r',   // '5r' | '4r' | '3r'
  shsToFlat: '3r',     // '3r' | '2r'
  shsAge: 65,

  // ── Children & Education ──────────────────────────────────────────────────
  // Up to 3 children modelled as discrete annual education outflow events.
  // childrenData: array of { id, birthYear, educationType ('local'|'overseas'|'none'), annualCost, startAge, endAge }
  // Engine reads this array and deducts annualCost from privateAssets for ages [startAge, endAge].
  // Baby Bonus + CDA grants are modelled as a Life Event of type 'child_birth' (see LIFE_EVENT_TYPES).
  childrenData: [],
};

// ── Household: spouse/partner default inputs ──────────────────────────────────
// Merges with DEFAULT_INPUTS so the full engine always receives well-typed values.
// Fields intentionally zeroed: balances, contributions, housing, medical (user fills in).
// Property & private assets are intentionally excluded from spouse — they're shared
// assets modelled on the primary member's profile.
export const SPOUSE_DEFAULT_INPUTS = {
  ...DEFAULT_INPUTS,
  name: "Spouse / Partner",
  isMale: false,           // default female (primary defaults male)
  oaBalance: 0, saBalance: 0, maBalance: 0,
  empOaCont: 0, empSaCont: 0, empMaCont: 0,
  vc3aCash: 0, vcSaTopup: 0, vcMaCash: 0, vcVhr: 0,
  annualGovGrant: 0, govGrantMa: 0, mrssGrant: 0, mmssGrant: 0, wisAmount: 0,
  housingOutflow: 0,        // spouse enters their own share of mortgage (if any)
  medicalUsage: 0, medishieldIP: 0, elderCareShield: 0,
  propertyValue: 0, includeProperty: false,  // property is a shared asset on primary
  currentPrivateAssets: 0, annualPrivateSaving: 0,
  srsBalance: 0, srsAnnualContribution: 0,
  oaToSaTransfer: 0, oaToMaTransfer: 0,
  cpfisOaAmount: 0, cpfisSaAmount: 0,
  oaDrawdownMonthly: 0, oaDrawdownStartAge: 0,
  dieWithZeroEnabled: false,
  lifeEvents: [],
  milestoneAge: 0, milestoneAge2: 0, milestoneAge3: 0, milestoneAge4: 0, milestoneAge5: 0, // BUG-7 fix: complete the explicit list
  // New fields (gap-analysis pass) — spouse tracks own portfolio/loans/support separately
  portfolioBalance: 0, portfolioAnnualReturn: 6, portfolioAnnualContribution: 0,
  portfolioContribStopAge: 0, portfolioWithdrawalMonthly: 0, portfolioWithdrawalStartAge: 0,
  loanMonthlyRepayment: 0, loanEndAge: 55,
  parentSupportMonthly: 0, parentSupportEndAge: 75,
  marriageAge: 0, housingGrantAmount: 0,
  childrenData: [],
  retirementExpenseRatio: 75, retirementHealthcareMonthly: 500,
  healthcareEscalatorAge: 75, healthcareEscalatorAnnualIncrease: 200,
};

export const INPUT_LABELS = {
  name: "Name", currentAge: "Current Age", currentYear: "Current Year", payoutAge: "Payout Age",
  contributionStopAge: "Contrib Stop Age", housingStopAge: "Housing Stop Age",
  isMale: "Gender (Male)", netTradeIncome: "Net Trade Income", oaBalance: "OA Balance", saBalance: "SA Balance", maBalance: "MA Balance",
  salaryGross: "Gross Salary", salaryBonus: "Annual Bonus", salaryGrowthRate: "Salary Growth %",
  salaryPhaseAge: "Phase 2 Start Age", salaryGrowthRate2: "Phase 2 Growth %",
  empOaCont: "Emp OA Contrib", empSaCont: "Emp SA Contrib", empMaCont: "Emp MA Contrib",
  vc3aCash: "VC3A Cash (Annual)", vcSaTopup: "RSTU SA/RA Top-up", vcVhr: "Housing Refund (VHR)",
  annualGovGrant: "Annual Gov Grant (to SA/RA)", // BUG-E fix: removed dead mrssGrant/mmssGrant labels
  govGrantMa: "Gov Grant (to MA)",
  wisAmount: "WIS (Workfare)", oaToSaTransfer: "OA→SA Transfer",
  oaToMaTransfer: "OA→MA Transfer", oaWithdrawalAt55: "OA Withdrawal at 55",
  usePropertyPledge: "Property Pledge", cpfisOaAmount: "CPFIS OA Invested", cpfisSaAmount: "CPFIS SA Invested",
  housingOutflow: "Housing Outflow", oaEduLoan: "OA Education Loan", oaEduLoanFreq: "OA Edu Loan Freq",
  mortgagePaymentSource: "Mortgage Payment Source", propertyIntention: "Property Intention", monthlyRentExpense: "Monthly Rent Expense", propertyType: "Property Type", propertyAge: "Property Age (years)", loanType: "Loan Type",
  medicalUsage: "Medical Usage",
  medishieldIP: "MediShield/IP", elderCareShield: "CareShield", medicalInflationRate: "Medical Infl. %",
  propertyValue: "Property Value", propertyGrowthRate: "Prop Growth %",
  propertyLeasehold: "Is Leasehold", propertyLeaseYears: "Lease Years",
  propertyGoalValue: "Property Goal Value",
  inflationRate: "Inflation Rate %", includeProperty: "Include Property", maxProjectionAge: "Max Projection Age",
  sellPropertyAge: "Sell Property Age",
  targetMonthlyIncome: "Target Monthly Income", currentPrivateAssets: "Private Assets",
  annualPrivateSaving: "Annual Private Saving", privateAssetGrowthRate: "Private Asset Growth %",
  privateAssetGoal: "Private Asset Goal",
  goalTargetCPF: "CPF Goal Target",
  plannedDownpaymentOA: "OA Downpayment", downpaymentAge: "Downpayment Age",
  ehgAmount: "Enhanced CPF Housing Grant", cpfHousingGrantResale: "CPF Housing Grant (Resale)", phgAmount: "Proximity Housing Grant", stepUpGrantAmount: "Step-Up CPF Grant",
  dpsMode: "DPS Mode", dpsAnnualPremium: "DPS Annual Premium", hpsAnnualPremium: "HPS Annual Premium",
  oaDrawdownStartAge: "OA Drawdown Start Age", oaDrawdownMonthly: "OA Monthly Drawdown",
  oaDrawdownFloor: "OA Drawdown Floor",
  srsGlidepathEnabled: "SRS Equity Glidepath", srsGlidepathStartEquityPct: "Starting Equity %",
  srsGlidepathEquityReturn: "Equity Return (%)", srsBondReturn: "Bond Return (%)",
  propMonetiseEnabled: "Prop Monetise",
  propMonetiseScheme: "Prop Scheme", propMonetiseAge: "Prop Monetise Age",
  propMonetiseCashProceeds: "Prop Cash Proceeds", propMonetiseRaTopup: "Prop RA Top-up",
  lbsMonthlyPayout: "LBS Monthly Payout", lbsPayoutEndAge: "LBS Payout End Age",
  rentalIncome: "Rental Income (Monthly)", rentalStartAge: "Rental Start Age", rentalEndAge: "Rental End Age",
  rentExpense: "Rental Expense (Monthly)", rentExpStartAge: "Rental Exp Start Age", rentExpEndAge: "Rental Exp End Age",
  srsBalance: "SRS Balance", srsAnnualContribution: "SRS Annual Contrib",
  srsContribStopAge: "SRS Contrib Stop Age", srsReturnRate: "SRS Return Rate %",
  srsDrawdownStartAge: "SRS Drawdown Start Age", srsDrawdownYears: "SRS Drawdown Years",
  // Session 2 & 3 additions
  isSelfEmployed: "Self-Employed", showSalaryCalc: "Show Salary Calc",
  pledgeWithdrawalAmount: "Pledge Withdrawal Amount", pledgeWithdrawalAge: "Pledge Withdrawal Age",
  dieWithZeroEnabled: "Die with Zero", dieWithZeroAge: "Die with Zero Age",
  vcMaCash: "Cash Top-up to MA", oaToMaForLovedOne: "OA→MA For Loved One", oaToSaForLovedOne: "OA→SA/RA For Loved One",
  prYear: "PR Tenure Year", citizenStatus: "Citizenship Status", isPwD: "Person with Disabilities (PwD)",
  retirementSumGrowth: "Retirement Sum Growth (%/yr)", birthMonth: "Birth Month", birthYear: "Birth Year",
  mcVariancePct: "Monte Carlo Variance (%)",
  lifeEvents: "Life Events",
  // RSS field labels
  cpfScheme: "CPF Scheme", rssPayoutStartAge: "RSS Payout Start Age",
  rssMonthlyPayout: "RSS Monthly Payout ($)", lifeMigrationAge: "Migrate to CPF LIFE Age",
  lifePlanAtMigration: "CPF LIFE Plan at Migration",
  applyRaOaTransfer: "Apply RA→OA Transfer at Payout/Migration Age",
  milestoneAge: "Milestone Age 1", milestoneAge2: "Milestone Age 2", milestoneAge3: "Milestone Age 3", milestoneAge4: "Milestone Age 4", milestoneAge5: "Milestone Age 5",
  budgetLivingExpenses: "Monthly Living Expenses", budgetExpenseInflation: "Expense Inflation (% p.a.)", budgetTaxRate: "Marginal Tax Rate (%)", budgetTaxOverride: "Override Auto Tax",
  emergencyFundMonths: "Emergency Fund (months)", hasWill: "Has Will", hasCPFNomination: "Has CPF Nomination", hasLPA: "Has LPA", hasAMD: "Has AMD", hasACP: "Has ACP", cpfWithdrawalLock: "CPF Withdrawal Lock", cpfMoneyLock: "CPF Money Lock", cpfSafetySwitch: "CPF Safety Switch", cpfTrustContactSet: "CPF Trust Contact", otherLiabilities: "Other Liabilities",
  cpfisOaFreq: "CPFIS OA Freq", cpfisSaFreq: "CPFIS SA Freq",
  oaWithdrawalFreq: "OA Withdrawal Freq", oaToMaFreq: "OA→MA Freq", oaToSaFreq: "OA→SA Freq", prRateType: "PR Rate Type",
  // Duration fields (years) for recurring freq-controlled inputs (0 = indefinite)
  vc3aDur: "VC3A Duration (yrs)", vcSaDur: "RSTU Duration (yrs)", vcMaDur: "VCMA Duration (yrs)",
  vcVhrDur: "VHR Duration (yrs)", govGrantDur: "Gov Grant Duration (yrs)", govGrantMaDur: "Gov Grant MA Duration (yrs)",
  wisDur: "WIS Duration (yrs)", // mrssDur removed — MRSS frequency mirrors RSTU by CPF policy
  cpfisOaDur: "CPFIS OA Duration (yrs)", cpfisSaDur: "CPFIS SA Duration (yrs)",
  housingDur: "Housing Duration (yrs)", oaToMaDur: "OA-MA Duration (yrs)",
  oaToSaDur: "OA-SA Duration (yrs)", oaEduLoanDur: "OA Edu Loan Duration (yrs)", oaWithdrawalDur: "OA Withdrawal Duration (yrs)",
  // ── Protection Coverage labels ───────────────────────────────────────────────
  termLifeSumAssured:        "Term / Whole Life SA ($)",
  criticalIllnessSumAssured: "Critical Illness SA ($)",
  hasISP:                    "Has Integrated Shield Plan",
  // ── New modules — gap-analysis pass ─────────────────────────────────────
  portfolioBalance:                   "Investment Portfolio Balance ($)",
  portfolioAnnualReturn:              "Portfolio Annual Return (%)",
  portfolioAnnualContribution:        "Portfolio Annual Contribution ($)",
  portfolioContribStopAge:            "Portfolio Contrib Stop Age",
  portfolioWithdrawalMonthly:         "Portfolio Monthly Withdrawal ($)",
  portfolioWithdrawalStartAge:        "Portfolio Withdrawal Start Age",
  loanMonthlyRepayment:               "Loan Monthly Repayment ($)",
  loanEndAge:                         "Loan End Age",
  parentSupportMonthly:               "Parent/Family Support Monthly ($)",
  parentSupportEndAge:                "Parent Support End Age",
  marriageAge:                        "Marriage Age",
  housingGrantAmount:                 "Housing Grant Amount ($)",
  childrenData:                       "Children Education Plans",
  retirementExpenseRatio:             "Retirement Expense Ratio (%)",
  retirementHealthcareMonthly:        "Additional Healthcare Budget ($/mo)",
  healthcareEscalatorAge:             "Healthcare Escalator Start Age",
  healthcareEscalatorAnnualIncrease:  "Healthcare Annual Increase ($/yr)",
};

// Alias used by the Compare tab — same labels, one source of truth
export const SCENARIO_LABELS = INPUT_LABELS;

// ── BUG-1 fix: module-level buildSafeInputs — single source of truth ──────
// Previously each import path (JSON file, URL ?p=, URL ?s=/?state=, Share Code)
// had its own inline raw whitelist copy. Each missed boolean coercion, lifeEvents
// null guards, life event skeleton sanitisation, and legacy field migrations.
// This function is the single authoritative sanitiser for all four paths.
export const LIFE_EVENT_DEFAULTS_MOD = {
  id: "", type: "retrenchment", label: "", startAge: 35, endAge: 36,
  magnitude: 0, enabled: true, drawSource: "oa_then_private",
  destination: "private",  // BUG-3 fix: engine + form use 'destination'; 'windfallDest' kept for old-profile compat
  windfallDest: "private", hyperRate: 0.06, overrideSalary: 0,
};

export const BOOL_FIELDS_MOD = [
  'isMale','isSelfEmployed','includeProperty','usePropertyPledge',
  'oaToMaForLovedOne','oaToSaForLovedOne','propMonetiseEnabled','dieWithZeroEnabled',
  'isPwD','propertyLeasehold','showSalaryCalc','hasISP','applyRaOaTransfer',
];

export function buildSafeInputs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_INPUTS };
  const safe = { ...DEFAULT_INPUTS };
  Object.keys(DEFAULT_INPUTS).forEach(k => {
    // Skip null for array fields — lifeEvents:null in old exports must not overwrite []
    if (raw[k] !== undefined && !(k === 'lifeEvents' && raw[k] === null)) safe[k] = raw[k];
  });
  // Boolean coercion — old exports may store booleans as strings or numbers
  BOOL_FIELDS_MOD.forEach(k => {
    if (typeof safe[k] === 'string') safe[k] = safe[k] === 'true' || safe[k] === '1';
    else if (typeof safe[k] === 'number') safe[k] = safe[k] !== 0;
  });
  // Guarantee lifeEvents is always an array
  if (!Array.isArray(safe.lifeEvents)) safe.lifeEvents = [];
  // Guarantee childrenData is always an array (new field — old profiles lack it)
  if (!Array.isArray(safe.childrenData)) safe.childrenData = [];
  // Life event skeleton sanitisation — merge each event against known-good defaults
  safe.lifeEvents = safe.lifeEvents.map(ev => {
    const base = { ...LIFE_EVENT_DEFAULTS_MOD };
    if (ev && typeof ev === 'object') {
      Object.keys(LIFE_EVENT_DEFAULTS_MOD).forEach(k => { if (ev[k] !== undefined) base[k] = ev[k]; });
      // Legacy field renames
      if (ev.amount !== undefined && ev.magnitude === undefined) base.magnitude = ev.amount;
      if (ev.source !== undefined && ev.drawSource === undefined) base.drawSource = ev.source;
    }
    return base;
  });
  // Legacy field migration: cpfisAmount → cpfisOaAmount
  if (raw.cpfisAmount !== undefined && !raw.cpfisOaAmount) safe.cpfisOaAmount = raw.cpfisAmount;
  // Legacy field migration: srsCitizenPR (boolean) → citizenStatus string
  if (raw.srsCitizenPR === false && raw.citizenStatus === undefined) safe.citizenStatus = 'foreigner';
  // Legacy field migration: careerBreakStartAge/EndAge → lifeEvents career_break entry
  const cbStart = raw.careerBreakStartAge !== undefined && raw.careerBreakStartAge !== '' ? Number(raw.careerBreakStartAge) : null;
  const cbEnd   = raw.careerBreakEndAge   !== undefined && raw.careerBreakEndAge   !== '' ? Number(raw.careerBreakEndAge)   : null;
  if (cbStart !== null && cbEnd !== null && !isNaN(cbStart) && !isNaN(cbEnd)) {
    const alreadyExists = safe.lifeEvents.some(ev => ev.type === 'career_break' && Number(ev.startAge) === cbStart && Number(ev.endAge) === cbEnd);
    if (!alreadyExists) {
      safe.lifeEvents = [...safe.lifeEvents, { ...LIFE_EVENT_DEFAULTS_MOD, id: `le-migrated-cb-${Date.now()}`, type: 'career_break', label: 'Career Break (migrated)', startAge: cbStart, endAge: cbEnd, magnitude: 0, enabled: true }];
    }
  }
  return safe;
}
