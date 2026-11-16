/**
 * Family rules shared by both engines (projection.js and rss.js), so they cannot drift apart.
 * Checked 16–17 Nov 2026 against CPF Board publications (see the CPF compliance register, items P, Q, S).
 *
 * CPF Education Loan Scheme
 *   - Ordinary Account savings pay tuition fees when they fall due (from a start age, for a number of years).
 *   - The student repays the amount withdrawn plus the interest it would have earned, into the member's
 *     Ordinary Account, over up to 12 years, usually starting one year after the course ends.
 *
 * CPF transfers to loved ones (from the Ordinary Account, then the Retirement Account from 55)
 *   - The member keeps back a retirement sum first: for a spouse, the current Basic Retirement Sum;
 *     for parents or grandparents, the current Full Retirement Sum, or the Basic Retirement Sum if the
 *     member owns a property that covers the rest of the Full Retirement Sum; for siblings and
 *     in-laws, the current Full Retirement Sum. Transfers get no tax relief.
 */
import { CPF_RATES } from '../policy/cpf2026.js';

export const MAX_EDU_REPAY_YEARS = 12;

const eduSpan = ({ startAge, from, freq, dur }) => ({
  first: from > 0 ? from : startAge, // 0 = from the first projection year (how older plans were set up)
  years: freq === 'one-time' ? 1 : dur > 0 ? dur : Infinity,
});

/** Whether a tuition withdrawal falls in this age year. */
export const eduWithdrawsAt = (age, opts) => {
  const { first, years } = eduSpan(opts);
  return age >= first && age < first + years;
};

/** Age repayments start: one year after the course ends. null when the course has no end set. */
export const eduRepayStartAge = (opts) => {
  const { first, years } = eduSpan(opts);
  return Number.isFinite(years) ? first + years + 1 : null;
};

export const makeEduLoan = () => ({ owed: 0, instalment: 0, paidYears: 0 });

/**
 * One year of the education loan: add this year's withdrawal, take this year's repayment, then add
 * the interest the savings would have earned (Ordinary Account rate). Repayments are equal yearly
 * instalments paid at the start of each year, so the loan is cleared in `years` instalments.
 * Returns the amount credited back to the member's Ordinary Account this year.
 */
export const eduLoanYear = (loan, { age, repayFrom, years = MAX_EDU_REPAY_YEARS, withdrawn = 0, rate = CPF_RATES.OA }) => {
  const n = Math.max(1, Math.min(MAX_EDU_REPAY_YEARS, Math.round(years) || MAX_EDU_REPAY_YEARS));
  loan.owed += Math.max(0, withdrawn);
  let repaid = 0;
  if (repayFrom !== null && age >= repayFrom && loan.owed > 0.5) {
    if (!loan.instalment) {
      loan.instalment = rate > 0 ? (loan.owed * rate) / ((1 + rate) * (1 - Math.pow(1 + rate, -n))) : loan.owed / n;
    }
    loan.paidYears += 1;
    repaid = loan.paidYears >= n ? loan.owed : Math.min(loan.instalment, loan.owed);
    loan.owed -= repaid;
  }
  loan.owed *= 1 + rate;
  return repaid;
};

/**
 * How much of a requested transfer to a loved one CPF allows this year, and from which account.
 * Below 55 only Ordinary Account savings can go; from 55, Ordinary Account first, then Retirement Account.
 */
export const lovedOneTransfer = ({ amount, age, oa, sa = 0, ra = 0, relation = 'parent', ownsProperty = false, propertyValue = 0, brs, frs }) => {
  const savings = age < 55 ? oa + sa : oa + ra;
  const propertyRoute = relation === 'parent' && ownsProperty && propertyValue >= frs - brs;
  const keep = relation === 'spouse' || propertyRoute ? brs : frs;
  const total = Math.max(0, Math.min(amount, savings - keep, age < 55 ? oa : oa + ra));
  const fromOa = Math.min(total, oa);
  return { fromOa, fromRa: total - fromOa, total, keep };
};
