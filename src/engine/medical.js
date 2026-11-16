/**
 * Yearly medical costs and how much of them MediSave can pay. Shared by both engines.
 *
 * Sources (checked 16 Nov 2026):
 *  - MOH, "About Integrated Shield Plans": the MediShield Life part of a premium is fully payable
 *    by MediSave; the private part only up to the Additional Withdrawal Limits, by age next
 *    birthday: 40 and below $300, 41 to 70 $600, 71 and above $900. The rest is paid in cash.
 *  - CPF Board, CareShield Life welcome booklets (2026): premiums are paid yearly until age 67,
 *    or for 10 years after joining, whichever is later, and are fully payable by MediSave.
 *  - CPF Board / careshieldlife.gov.sg: members born in 1979 or earlier may also pay a flat
 *    catch-up component for 10 years on top of the base premium. Base premiums rise regularly
 *    and stay flat after age 67 if still payable.
 *
 * Inputs (all yearly, in today's dollars unless stated):
 *   medicalUsage          — medical bills paid from MediSave
 *   medishieldMode        — 'auto' (default): MediShield Life premium from the official age table
 *                           'manual': medishieldIP is the member's whole MediShield Life + IP premium
 *   medishieldIP          — manual mode only (see above)
 *   ipPrivatePremium      — auto mode: private part of an Integrated Shield Plan (0 = none)
 *   elderCareShield       — CareShield Life base premium
 *   careShieldJoinAge     — age when CareShield Life premiums started (0 = at 30)
 *   careShieldCatchUp     — flat catch-up component, paid for 10 years from joining (not inflated)
 *   medicalInflationRate  — % a year growth applied to bills and premiums
 */
import { getMslPremiumForAge } from '../policy/cpf2026.js';

export const IP_AWL = [{ maxAge: 40, limit: 300 }, { maxAge: 70, limit: 600 }, { maxAge: Infinity, limit: 900 }];
/** MediSave limit for the private part of an Integrated Shield Plan, by age next birthday. */
export const ipWithdrawalLimit = (ageNextBirthday) => IP_AWL.find((b) => ageNextBirthday <= b.maxAge).limit;

export const CARESHIELD_START_AGE = 30, CARESHIELD_LAST_AGE = 67, CARESHIELD_MIN_YEARS = 10;
/** Ages (inclusive) at which CareShield Life premiums are paid. */
export const careShieldAges = (joinAge) => {
  const from = Math.max(CARESHIELD_START_AGE, Number(joinAge) || CARESHIELD_START_AGE);
  return { from, to: Math.max(CARESHIELD_LAST_AGE, from + CARESHIELD_MIN_YEARS - 1) };
};

const n = (v) => Number(v) || 0;

/**
 * Medical costs for one year of age.
 * @param {object} inputs  engine inputs
 * @param {number} age     age during the year (the member's next birthday is age + 1)
 * @param {number} yrSince years since the projection started
 * @param {number} ma      MediSave balance available
 * @returns {{ fromMa, cash, msl, ipFromMa, ipCash, careShield, usage }}
 *   fromMa — taken from MediSave;  cash — must be paid from outside CPF
 *   (the private-plan excess over the limit, plus anything MediSave cannot cover)
 */
export const medicalYear = (inputs, age, yrSince, ma) => {
  const grow = Math.pow(1 + n(inputs.medicalInflationRate) / 100, Math.max(0, yrSince));
  const anb = age + 1;
  const tableMsl = getMslPremiumForAge(anb) * grow;

  let msl, ipPrivate;
  if (inputs.medishieldMode === 'manual') {
    const total = n(inputs.medishieldIP) * grow;       // the member's own combined premium
    msl = Math.min(total, tableMsl);
    ipPrivate = total - msl;
  } else {
    msl = tableMsl;
    ipPrivate = n(inputs.ipPrivatePremium) * grow;
  }
  const ipFromMaWanted = Math.min(ipPrivate, ipWithdrawalLimit(anb));
  const ipOverLimit = ipPrivate - ipFromMaWanted;

  // CareShield Life: base premium grows until 67 and is flat after; catch-up is flat for 10 years.
  const cs = careShieldAges(inputs.careShieldJoinAge);
  const startAge = age - yrSince;
  const growTo67 = Math.pow(1 + n(inputs.medicalInflationRate) / 100, Math.max(0, Math.min(age, CARESHIELD_LAST_AGE) - startAge));
  const base = age >= cs.from && age <= cs.to ? n(inputs.elderCareShield) * growTo67 : 0;
  const catchUp = age >= cs.from && age < cs.from + CARESHIELD_MIN_YEARS ? n(inputs.careShieldCatchUp) : 0;
  const careShield = base + catchUp;

  const usage = n(inputs.medicalUsage) * grow;
  const wanted = Math.round(msl + ipFromMaWanted + careShield + usage);
  const fromMa = Math.min(wanted, Math.max(0, Math.round(ma)));
  return {
    fromMa, cash: Math.round(ipOverLimit) + (wanted - fromMa),
    msl: Math.round(msl), ipFromMa: Math.round(ipFromMaWanted), ipCash: Math.round(ipOverLimit),
    careShield: Math.round(careShield), usage: Math.round(usage),
  };
};
