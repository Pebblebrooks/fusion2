/**
 * IRAS personal income tax (resident rates).
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// ── IRAS resident individual income tax — Year of Assessment 2024 onwards ────
// Source: IRAS "Individual Income Tax rates" (resident rates from YA 2024).
// Each slab: floor = start of band; baseTax = cumulative tax owed at exactly floor.
export const IRAS_SLABS = [
  { floor: 0,       ceiling: 20000,    baseTax: 0,      marginal: 0     },
  { floor: 20000,   ceiling: 30000,    baseTax: 0,      marginal: 0.02  },
  { floor: 30000,   ceiling: 40000,    baseTax: 200,    marginal: 0.035 },
  { floor: 40000,   ceiling: 80000,    baseTax: 550,    marginal: 0.07  },
  { floor: 80000,   ceiling: 120000,   baseTax: 3350,   marginal: 0.115 },
  { floor: 120000,  ceiling: 160000,   baseTax: 7950,   marginal: 0.15  },
  { floor: 160000,  ceiling: 200000,   baseTax: 13950,  marginal: 0.18  },
  { floor: 200000,  ceiling: 240000,   baseTax: 21150,  marginal: 0.19  },
  { floor: 240000,  ceiling: 280000,   baseTax: 28750,  marginal: 0.195 },
  { floor: 280000,  ceiling: 320000,   baseTax: 36550,  marginal: 0.20  },
  { floor: 320000,  ceiling: 500000,   baseTax: 44550,  marginal: 0.22  },
  { floor: 500000,  ceiling: 1000000,  baseTax: 84150,  marginal: 0.23  },
  { floor: 1000000, ceiling: Infinity, baseTax: 199150, marginal: 0.24  },
];

// Returns total annual income tax for a given chargeable income (after reliefs).
export const computeIrasTax = (chargeableIncome) => {
  if (chargeableIncome <= 0) return 0;
  const s = IRAS_SLABS.find((b) => chargeableIncome <= b.ceiling) || IRAS_SLABS[IRAS_SLABS.length - 1];
  return Math.round(s.baseTax + (chargeableIncome - s.floor) * s.marginal);
};

// Returns the marginal (top) tax rate for a given chargeable income.
export const getMarginalRate = (chargeableIncome) => {
  if (chargeableIncome <= 20000) return 0;
  for (const s of IRAS_SLABS) {
    if (chargeableIncome <= s.ceiling) return s.marginal;
  }
  return 0.24;
};
