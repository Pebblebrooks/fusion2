/**
 * Scheme rules shared by both engines (projection.js and rss.js), so they cannot drift apart.
 * Checked 18 Nov 2026 against HDB and CPF Board publications (CPF compliance register, corrections 22–27).
 *
 * Lease Buyback Scheme (HDB terms and conditions, December 2025; applications in 2026)
 *   - From 65. Each owner's share of the net proceeds first tops up their own Retirement Account to a
 *     requirement: one owner, the Full Retirement Sum; two or more owners, the Basic Retirement Sum;
 *     less S$10,000 / S$5,000 from 70 and S$20,000 / S$10,000 from 80 (2026 table, scaled here with
 *     the sums). If the household keeps more than S$100,000 in cash, the excess tops up each owner's
 *     RA to the current Full Retirement Sum. The rest is paid in cash.
 *   - Cash bonus on the household's RA top-ups: full bonus at S$60,000 (S$30,000 / S$15,000 / S$7,500
 *     for 3-room or smaller / 4-room / 5-room or bigger), otherwise S$1 for every S$2 / S$4 / S$8.
 *     Shared between owners in proportion to their top-ups. HDB pays no monthly income.
 *   - Fusion models one member. With two or more owners it assumes the other owners' shares and top-ups
 *     are the same as the member's.
 *
 * Matched Retirement Savings Scheme / Matched MediSave Scheme (CPF Board, 2026)
 *   - Also need: own no more than one property, and live in a home with an annual value of S$21,000
 *     or less (member's yes/no answer, `matchedPropertyOk`).
 *
 * CPF Investment Scheme (CPF Board FAQs)
 *   - Investments are not sold at 55 and are not used to form the Retirement Account. They can be
 *     held for as long as the member chooses. Returns are not guaranteed and can be negative.
 *   - On sale: CPFIS-OA proceeds return to the Ordinary Account. CPFIS-SA proceeds return to the
 *     Special Account below 55; from 55 they go to the Retirement Account up to the member's Full
 *     Retirement Sum and the rest to the Ordinary Account.
 *
 * Retirement sum set aside with property (CPF Board, CPF transfer terms and pledge terms)
 *   - Property counts as the CPF used for it plus accrued interest, or the amount secured by a pledge,
 *     only if the remaining lease lasts the member to at least 95. Property can make up at most the
 *     difference between the Full and Basic Retirement Sums.
 */

export const LBS = {
  minAge: 65,
  cashCap: 100000,
  fullBonusAt: 60000,
  flats: {
    '3r': { label: '3-room or smaller', cap: 30000, per: 2 },
    '4r': { label: '4-room', cap: 15000, per: 4 },
    '5r': { label: '5-room or bigger', cap: 7500, per: 8 },
  },
};

/** RA requirement for one owner joining the Lease Buyback Scheme at `age`. */
export const lbsRequirement = ({ age, owners = 1, frs, brs }) => {
  const step = age >= 80 ? 2 : age >= 70 ? 1 : 0;
  // 2026 table: FRS 220,400 → 210,400 → 200,400; BRS 110,200 → 105,200 → 100,200.
  const cut = (10000 / 220400) * step;
  return Math.round(owners > 1 ? brs * (1 - cut) : frs * (1 - cut));
};

/**
 * What the member gets from the Lease Buyback Scheme.
 * @param proceeds the member's share of the net proceeds (after any loan or CPF refund HDB deducts)
 * @param ra the member's Retirement Account before the top-up
 */
export const lbsOutcome = ({ age, proceeds = 0, ra = 0, owners = 1, flat = '4r', frs, brs }) => {
  const n = Math.max(1, Math.round(owners) || 1);
  const share = Math.max(0, proceeds);
  const requirement = lbsRequirement({ age, owners: n, frs, brs });
  let topUp = Math.min(share, Math.max(0, requirement - ra));
  let cash = share - topUp;
  const cashCapShare = LBS.cashCap / n;
  if (cash > cashCapShare) {
    const extra = Math.min(cash - cashCapShare, Math.max(0, frs - (ra + topUp)));
    topUp += extra; cash -= extra;
  }
  const f = LBS.flats[flat] || LBS.flats['4r'];
  const household = topUp * n;
  const bonus = Math.round(Math.min(f.cap, household / f.per) / n);
  return { requirement, topUp: Math.round(topUp), cash: Math.round(cash), bonus, household: Math.round(household) };
};

/** MRSS/MMSS property conditions: no more than one property, home annual value S$21,000 or less. */
export const matchedPropertyOk = (inputs) => inputs.matchedPropertyOk !== false;

/**
 * Property towards the Full Retirement Sum: a pledge counts in full (FRS − BRS); otherwise the CPF used
 * for the home with accrued interest. Nothing unless the lease lasts the member to 95.
 */
export const propertyTowardsFrs = ({ owns, pledged = false, cpfUsedWithInterest = 0, leaseLeft = Infinity, age, frs, brs }) => {
  if (!owns || leaseLeft < Math.max(0, 95 - age)) return 0;
  const room = Math.max(0, frs - brs);
  return pledged ? room : Math.min(room, Math.max(0, cpfUsedWithInterest));
};

/** Whether the member has set aside the Full Retirement Sum (cash, or BRS in cash plus property). */
export const frsSetAside = ({ cash, property = 0, frs, brs }) => cash >= frs || (cash >= brs && cash + property >= frs);

// ── CPF Investment Scheme ────────────────────────────────────────────────────
export const makeCpfis = ({ oaHeld = 0, saHeld = 0 } = {}) => {
  const oa = Math.max(0, Number(oaHeld) || 0), sa = Math.max(0, Number(saHeld) || 0);
  return { oa, sa, netOa: oa, netSa: sa, sold: false };
};

/** Add new money invested this year (already taken from the OA or SA by the engine). */
export const cpfisInvest = (pot, { fromOa = 0, fromSa = 0 }) => {
  pot.oa += fromOa; pot.sa += fromSa; pot.netOa += fromOa; pot.netSa += fromSa;
};

/**
 * One year of growth. `rate` may be negative. `fall` is a one-off market fall (0.3 = 30%) for a stress test.
 * Returns the gain or loss for the year.
 */
export const cpfisGrow = (pot, { rate = 0, fall = 0 }) => {
  const before = pot.oa + pot.sa;
  const k = Math.max(0, (1 + rate) * (1 - Math.min(1, Math.max(0, fall))));
  pot.oa *= k; pot.sa *= k;
  return pot.oa + pot.sa - before;
};

/**
 * Sell everything. Returns where the proceeds go. From 55, CPFIS-SA proceeds fill the RA up to `frs`
 * (the member's own Full Retirement Sum), then the OA.
 */
export const cpfisSell = (pot, { age, ra, frs }) => {
  const toOa0 = pot.oa, sa = pot.sa;
  let toSa = 0, toRa = 0, toOa = toOa0;
  if (age < 55) toSa = sa;
  else { toRa = Math.min(sa, Math.max(0, frs - ra)); toOa += sa - toRa; }
  pot.oa = 0; pot.sa = 0; pot.netOa = 0; pot.netSa = 0; pot.sold = true;
  return { toOa, toSa, toRa, total: toOa0 + sa };
};

// ── Ordinary Account savings after 55 ────────────────────────────────────────
/**
 * A withdrawal from the Ordinary Account from 55 (CPF Board): until the member's retirement sum is set
 * aside, only the S$5,000 is withdrawable, and non-withdrawable OA savings are moved to the Retirement
 * Account (up to the shortfall) when a withdrawal is made. Once the sum is met, all OA savings are
 * withdrawable. `need` is the RA shortfall: the member's FRS (or BRS with a property pledge) less the RA.
 * Returns the amount moved to the RA, the amount paid out, and the S$5,000 still unused.
 */
export const oaWithdrawal = ({ want = 0, oa = 0, need = 0, free5k = 5000, floor = 0 }) => {
  let shortfall = Math.max(0, need);
  const toRa = Math.min(Math.max(0, oa - Math.max(0, free5k)), shortfall);
  const left = oa - toRa;
  shortfall -= toRa;
  const withdrawable = shortfall > 0 ? Math.min(left, Math.max(0, free5k)) : left;
  const out = Math.max(0, Math.min(want, withdrawable, left - floor));
  return { toRa, out, free5kLeft: shortfall > 0 ? Math.max(0, free5k - out) : free5k };
};

/** At payout start: non-withdrawable OA savings move to the RA up to the shortfall (CPF Board). */
export const oaToRaAtPayout = ({ oa = 0, need = 0, free5k = 5000 }) =>
  Math.min(Math.max(0, oa - Math.max(0, free5k)), Math.max(0, need));
