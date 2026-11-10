// Golden test profiles — each is merged over DEFAULT_INPUTS. Cover every engine branch we can reach.
// Pinned clock for reproducible tests (profile date: November 2026).
export const GOLDEN_CLOCK = { currentYear: 2026, currentMonth: 11 };
const base = { oaBalance: 50000, saBalance: 30000, maBalance: 20000, salaryGross: 6000, empOaCont: 16560, empSaCont: 4320, empMaCont: 5760 };
export const PROFILES = {
  sc25_starter:      { currentAge: 25, payoutAge: 65, oaBalance: 8000, saBalance: 3000, maBalance: 4000, salaryGross: 4000, empOaCont: 11040, empSaCont: 2880, empMaCont: 3840 },
  sc35_typical:      { currentAge: 35, payoutAge: 65, ...base },
  sc45_housing:      { currentAge: 45, payoutAge: 65, ...base, oaBalance: 90000, saBalance: 110000, maBalance: 55000, housingOutflow: 18000 },
  sc50_rstu:         { currentAge: 50, payoutAge: 65, ...base, oaBalance: 120000, saBalance: 150000, maBalance: 60000, salaryGross: 8000, vcSaTopup: 8000 },
  sc54_transfer:     { currentAge: 54, payoutAge: 65, ...base, oaBalance: 160000, saBalance: 190000, maBalance: 70000, oaToSaTransfer: 20000 },
  sc55_atclosure:    { currentAge: 55, payoutAge: 65, ...base, oaBalance: 140000, saBalance: 210000, maBalance: 75000 },
  sc58_post55:       { currentAge: 58, payoutAge: 65, ...base, oaBalance: 60000, saBalance: 200000, maBalance: 70000, salaryGross: 5000 },
  sc62_late:         { currentAge: 62, payoutAge: 67, ...base, oaBalance: 40000, saBalance: 180000, maBalance: 70000, salaryGross: 3500 },
  sc66_retired:      { currentAge: 66, payoutAge: 66, ...base, oaBalance: 30000, saBalance: 210000, maBalance: 75000, salaryGross: 0, empOaCont: 0, empSaCont: 0, empMaCont: 0 },
  sc40_payout70:     { currentAge: 40, payoutAge: 70, ...base },
  pr_year1:          { currentAge: 30, payoutAge: 65, ...base, citizenStatus: 'PR', prYear: 1 },
  pr_year2_fg:       { currentAge: 38, payoutAge: 65, ...base, citizenStatus: 'PR', prYear: 2, prRateType: 'FG' },
  foreigner:         { currentAge: 35, payoutAge: 65, ...base, citizenStatus: 'foreigner', srsBalance: 20000, srsAnnualContribution: 35700 },
  sep_selfemployed:  { currentAge: 42, payoutAge: 65, ...base, isSelfEmployed: true, netTradeIncome: 80000 },
  cpfis:             { currentAge: 40, payoutAge: 65, ...base, oaBalance: 80000, cpfisOaAmount: 10000 },
  events_mixed:      { currentAge: 38, payoutAge: 65, ...base, lifeEvents: [ { type: 'retrenchment', startAge: 45, endAge: 46, magnitude: 0 }, { type: 'windfall', startAge: 50, endAge: 50, magnitude: 80000 }, { type: 'early_retirement', startAge: 58, endAge: 58, magnitude: 0 } ] },
  events_barista:    { currentAge: 40, payoutAge: 65, ...base, lifeEvents: [ { type: 'barista_fire', startAge: 50, endAge: 60, magnitude: 2000 } ] },
  srs_glidepath:     { currentAge: 45, payoutAge: 65, ...base, srsBalance: 60000, srsAnnualContribution: 15300, srsGlidepathEnabled: true, srsDrawdownStartAge: 63 },
  oa_drawdown:       { currentAge: 60, payoutAge: 65, ...base, oaBalance: 150000, saBalance: 200000, oaDrawdownStartAge: 65, oaDrawdownMonthly: 800 },
  property_monetise: { currentAge: 55, payoutAge: 65, ...base, propertyValue: 600000, propMonetiseEnabled: true, propMonetiseScheme: 'downgrade', propMonetiseAge: 65 },
};
export const RSS_PROFILES = {
  rss_basic:   { currentAge: 70, payoutAge: 65, cpfScheme: 'rss', oaBalance: 20000, saBalance: 120000, maBalance: 50000, salaryGross: 0, rssMonthlyPayout: 600 },
  rss_migrate: { currentAge: 72, payoutAge: 65, cpfScheme: 'rss', oaBalance: 10000, saBalance: 90000, maBalance: 40000, salaryGross: 0, rssMonthlyPayout: 500, lifeMigrationAge: 75 },
};
