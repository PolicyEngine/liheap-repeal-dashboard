import fallbackData from './liheapFallbackData.json';

/**
 * LIHEAP benefit matrices and computation for DC, MA, and IL.
 *
 * Data comes from the PolicyEngine /us/metadata API at runtime.
 * Parameter values are evaluated at the simulation date (2024-01-01)
 * to match what the PolicyEngine engine uses for year 2024.
 */

// ===== Data types =====

export interface LiheapData {
  dc: {
    incomeIncrement: number;
    heatInRent: number;
    oil: number;
    /** payment[heatingType][housingType] = number[10 levels][4 sizes] */
    payment: Record<string, Record<string, number[][]>>;
  };
  ma: {
    /** standard[subsidized_key][level 0-5] = [utility, deliverable] */
    standard: Record<string, number[][]>;
    /** hecs[level 0-5] = amount (conditional on prior-year expense) */
    hecs: number[];
  };
  il: {
    /** matrices[fuelType][bracket 0-3] = number[6 sizes] */
    matrices: Record<string, number[][]>;
    /** FPL ratio thresholds for brackets 1-4 */
    bracketThresholds: number[];
  };
  /** Federal Poverty Guidelines extracted from API metadata */
  fpl: {
    /** FPG at simulation date (2024-01-01) — used by IL */
    firstPerson: number;
    additionalPerson: number;
    /** MA-specific: FPG at {year-1}-10-01 per ma_liheap_fpg.py */
    maFirstPerson: number;
    maAdditionalPerson: number;
  };
  /** State Median Income data for eligibility checks */
  smi: {
    /** SMI base amount per state */
    amount: Record<string, number>;
    /** Size adjustment factors */
    firstPerson: number;
    secondToSixth: number;
    additionalPerson: number;
    threshold: number;
    /** LIHEAP SMI fraction (typically 0.6) */
    smiLimit: number;
  };
  /** IL-specific FPG eligibility limit (typically 2.0) */
  ilFpgLimit: number;
}

export const FALLBACK_LIHEAP_DATA: LiheapData = fallbackData;

// ===== Simulation date constants =====

const SIM_YEAR = 2026;
const EVAL_DATE = `${SIM_YEAR}-01-01`;
/** MA evaluates FPG at the prior fiscal year start (Oct 1 of year-1) */
const MA_FPG_DATE = `${SIM_YEAR - 1}-10-01`;

// ===== Hardcoded FPL fallbacks (2026 HHS poverty guidelines) =====

const FPL_BASE = 15960;
const FPL_INCREMENT = 5680;

export function getFPL(householdSize: number, data?: LiheapData, state?: string): number {
  if (data) {
    const fp = state === 'MA' ? data.fpl.maFirstPerson : data.fpl.firstPerson;
    const ap = state === 'MA' ? data.fpl.maAdditionalPerson : data.fpl.additionalPerson;
    return fp + ap * (Math.max(1, householdSize) - 1);
  }
  return FPL_BASE + FPL_INCREMENT * (Math.max(1, householdSize) - 1);
}


// ===== Parse live data from API metadata =====

/**
 * Get the parameter value effective on the target date.
 * Finds the latest entry whose date is <= targetDate.
 */
function valueAt(values: Record<string, number>, targetDate: string): number {
  const dates = Object.keys(values).sort();
  let result = 0;
  for (const date of dates) {
    if (date <= targetDate) {
      result = values[date];
    } else {
      break;
    }
  }
  return result;
}

/**
 * Parse the PolicyEngine /us/metadata response into LiheapData.
 * All values come from the API, evaluated at the simulation date.
 */
export function parseMetadata(params: Record<string, any>): LiheapData {
  const get = (key: string, date: string = EVAL_DATE): number => {
    const p = params[key];
    if (!p?.values) return 0;
    return valueAt(p.values, date);
  };

  // ── DC ──
  const dcIncrement = get('gov.states.dc.doee.liheap.income_level_increment');
  const dcHeatInRent = get('gov.states.dc.doee.liheap.payment.heat_in_rent');
  const dcOil = get('gov.states.dc.doee.liheap.payment.oil');

  const dcPayment: Record<string, Record<string, number[][]>> = {};
  for (const fuel of ['electricity', 'gas']) {
    const fuelKey = fuel === 'electricity' ? 'ELECTRICITY' : 'GAS';
    dcPayment[fuelKey] = {};
    for (const housing of ['MULTI_FAMILY', 'SINGLE_FAMILY']) {
      const matrix: number[][] = [];
      for (let level = 1; level <= 10; level++) {
        const row: number[] = [];
        for (let size = 1; size <= 4; size++) {
          row.push(get(`gov.states.dc.doee.liheap.payment.${fuel}.${housing}.${level}.${size}`));
        }
        matrix.push(row);
      }
      dcPayment[fuelKey][housing] = matrix;
    }
  }

  // ── MA ──
  const maStandard: Record<string, number[][]> = {};
  for (const sub of ['non_subsidized', 'subsidized']) {
    const levels: number[][] = [];
    for (let lvl = 1; lvl <= 6; lvl++) {
      const utility = get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${lvl}.UTILITY_AND_HEAT_IN_RENT`);
      const deliverable = get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${lvl}.DELIVERABLE_FUEL`);
      levels.push([utility, deliverable]);
    }
    maStandard[sub] = levels;
  }

  const maHecs: number[] = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    maHecs.push(get(`gov.states.ma.doer.liheap.hecs.amount.non_subsidized.${lvl}`));
  }

  // ── IL ──
  const ilFuelMap: Record<string, string> = {
    ALL_ELECTRIC: 'all_electric',
    NAT_GAS_OTHER: 'nat_gas',
    PROPANE_FUEL_OIL: 'propane',
    CASH: 'cash',
  };
  const ilMatrices: Record<string, number[][]> = {};
  for (const [fuelKey, paramFuel] of Object.entries(ilFuelMap)) {
    const matrix: number[][] = [];
    for (let bracket = 1; bracket <= 4; bracket++) {
      const row: number[] = [];
      for (let size = 1; size <= 6; size++) {
        row.push(get(`gov.states.il.dceo.liheap.payment.matrix.${paramFuel}.${bracket}.${size}`));
      }
      matrix.push(row);
    }
    ilMatrices[fuelKey] = matrix;
  }

  const ilThresholds: number[] = [];
  for (let i = 0; i < 4; i++) {
    ilThresholds.push(get(`gov.states.il.dceo.liheap.payment.income_bracket[${i}].threshold`));
  }

  // ── Federal Poverty Guidelines ──
  const fplFirstPerson = get('gov.hhs.fpg.first_person.CONTIGUOUS_US');
  const fplAdditionalPerson = get('gov.hhs.fpg.additional_person.CONTIGUOUS_US');
  // MA evaluates FPG at {year-1}-10-01 per ma_liheap_fpg.py
  const maFplFirstPerson = get('gov.hhs.fpg.first_person.CONTIGUOUS_US', MA_FPG_DATE);
  const maFplAdditionalPerson = get('gov.hhs.fpg.additional_person.CONTIGUOUS_US', MA_FPG_DATE);

  // ── State Median Income (for eligibility checks) ──
  const smiAmounts: Record<string, number> = {};
  for (const st of ['DC', 'MA', 'IL']) {
    smiAmounts[st] = get(`gov.hhs.smi.amount.${st}`);
  }
  const smiFirstPerson = get('gov.hhs.smi.household_size_adjustment.first_person');
  const smiSecondToSixth = get('gov.hhs.smi.household_size_adjustment.second_to_sixth_person');
  const smiAdditionalPerson = get('gov.hhs.smi.household_size_adjustment.additional_person');
  const smiThreshold = get('gov.hhs.smi.additional_person_threshold');
  const smiLimit = get('gov.hhs.liheap.smi_limit');
  const ilFpgLimit = get('gov.states.il.dceo.liheap.eligibility.fpg_limit');

  return {
    dc: { incomeIncrement: dcIncrement, heatInRent: dcHeatInRent, oil: dcOil, payment: dcPayment },
    ma: { standard: maStandard, hecs: maHecs },
    il: { matrices: ilMatrices, bracketThresholds: ilThresholds },
    fpl: {
      firstPerson: fplFirstPerson || FPL_BASE,
      additionalPerson: fplAdditionalPerson || FPL_INCREMENT,
      maFirstPerson: maFplFirstPerson || FPL_BASE,
      maAdditionalPerson: maFplAdditionalPerson || FPL_INCREMENT,
    },
    smi: {
      amount: smiAmounts,
      firstPerson: smiFirstPerson || 1,
      secondToSixth: smiSecondToSixth || 0,
      additionalPerson: smiAdditionalPerson || 0,
      threshold: smiThreshold || 6,
      smiLimit: smiLimit || 0.6,
    },
    ilFpgLimit: ilFpgLimit || 2.0,
  };
}

/** Fetch metadata from the API and parse LIHEAP parameters. */
export async function fetchLiheapData(apiUrl: string): Promise<LiheapData> {
  const res = await fetch(`${apiUrl}/us/metadata`);
  if (!res.ok) throw new Error(`Metadata fetch failed: ${res.status}`);
  const data = await res.json();
  return parseMetadata(data.result?.parameters ?? {});
}

// ===== Benefit computation =====

/** Compute State Median Income for a given state and household size, matching hhs_smi.py */
function getSMI(state: string, householdSize: number, data: LiheapData): number {
  const s = data.smi;
  const base = s.amount[state] || 0;
  if (base === 0) return Infinity; // if no data, don't restrict eligibility
  const size = Math.max(1, householdSize);
  const cappedExtra = Math.min(size - 1, s.threshold - 1);
  const additionalExtra = Math.max(size - s.threshold, 0);
  const adjustment = s.firstPerson + s.secondToSixth * cappedExtra + s.additionalPerson * additionalExtra;
  return base * adjustment;
}

/** Check LIHEAP income eligibility for a given state */
export function isEligible(state: string, income: number, householdSize: number, data: LiheapData): boolean {
  const smiThreshold = getSMI(state, householdSize, data) * data.smi.smiLimit;
  if (state === 'IL') {
    const fplThreshold = getFPL(householdSize, data, 'IL') * data.ilFpgLimit;
    return income <= Math.max(smiThreshold, fplThreshold);
  }
  if (state === 'MA') {
    // MA uses 200% FPL (with prior-year FPG)
    const fplThreshold = getFPL(householdSize, data, 'MA') * 2.0;
    return income <= fplThreshold;
  }
  // DC: 60% SMI
  return income <= smiThreshold;
}

function dcIncomeLevel(income: number, increment: number): number {
  if (income <= 0) return 1;
  return Math.min(10, Math.ceil(income / increment));
}

function maBenefitLevel(income: number, householdSize: number, data: LiheapData): number {
  const fpl = getFPL(householdSize, data, 'MA');
  const ratio = income / fpl;
  if (ratio < 1.0) return 1;
  if (ratio < 1.25) return 2;
  if (ratio < 1.5) return 3;
  if (ratio < 1.75) return 4;
  if (ratio < 2.0) return 5;
  return 6;
}

function ilIncomeBracket(income: number, householdSize: number, thresholds: number[], data: LiheapData): number {
  const fpl = getFPL(householdSize, data, 'IL');
  const ratio = income / fpl;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (ratio >= thresholds[i]) return i + 1;
  }
  return 1;
}

const MA_DELIVERABLE_TYPES = ['HEATING_OIL_AND_PROPANE', 'KEROSENE', 'OTHER'];

export interface BenefitParams {
  state: string;
  heatingType: string;
  income: number;
  heatingExpense: number;
  householdSize: number;
  housingType?: string;
  subsidized?: boolean;
}

export function computeBenefit(p: BenefitParams, data: LiheapData): number {
  // Check eligibility first — if income exceeds threshold, benefit is $0
  if (!isEligible(p.state, p.income, p.householdSize, data)) return 0;

  switch (p.state) {
    case 'DC': {
      const { dc } = data;
      if (p.heatingType === 'HEAT_IN_RENT') return dc.heatInRent;
      if (p.heatingType === 'OIL') return Math.min(dc.oil, p.heatingExpense);
      const level = dcIncomeLevel(p.income, dc.incomeIncrement);
      const sizeIdx = Math.min(Math.max(1, p.householdSize), 4) - 1;
      const matrix = dc.payment[p.heatingType]?.[p.housingType || 'MULTI_FAMILY'];
      if (!matrix) return 0;
      return Math.min(matrix[level - 1][sizeIdx], p.heatingExpense);
    }
    case 'MA': {
      const { ma } = data;
      const level = maBenefitLevel(p.income, p.householdSize, data);
      const isDeliverable = MA_DELIVERABLE_TYPES.includes(p.heatingType);
      const fuelIdx = isDeliverable ? 1 : 0;
      const table = p.subsidized ? ma.standard.subsidized : ma.standard.non_subsidized;
      const standardPayment = table[level - 1][fuelIdx];
      // HECS is NOT included in chart computation — it requires
      // heating_expense_last_year > threshold, which the chart doesn't model.
      // The API result card handles HECS correctly when the user provides prior-year data.
      if (p.heatingType === 'HEAT_IN_RENT') return standardPayment;
      return Math.min(standardPayment, p.heatingExpense);
    }
    case 'IL': {
      const { il } = data;
      // Eligibility uses max(60% SMI, 200% FPL) — we don't model SMI here,
      // but the chart range stays within typical eligibility bounds.
      const bracket = ilIncomeBracket(p.income, p.householdSize, il.bracketThresholds, data);
      const sizeIdx = Math.min(Math.max(1, p.householdSize), 6) - 1;
      const matrix = il.matrices[p.heatingType];
      if (!matrix) return 0;
      const matrixAmount = matrix[bracket - 1][sizeIdx];
      if (p.heatingType === 'CASH') return matrixAmount;
      return Math.min(matrixAmount, p.heatingExpense);
    }
    default:
      return 0;
  }
}

// ===== Chart data generators =====

/** Income range for chart x-axis. */
function chartIncomeMax(state: string, householdSize: number, data: LiheapData): number {
  // Use the actual eligibility threshold + 15% headroom so the cutoff is visible
  const smiThreshold = getSMI(state, householdSize, data) * data.smi.smiLimit;
  if (state === 'IL') {
    const fplThreshold = getFPL(householdSize, data, 'IL') * data.ilFpgLimit;
    return Math.max(smiThreshold, fplThreshold) * 1.15;
  }
  if (state === 'MA') {
    const fplThreshold = getFPL(householdSize, data, 'MA') * 2.0;
    return fplThreshold * 1.15;
  }
  return smiThreshold * 1.15;
}

/** Max possible benefit for a state — determines expense axis range. */
function chartExpenseMax(state: string, householdSize: number, data: LiheapData): number {
  let maxBenefit = 0;
  switch (state) {
    case 'DC': {
      maxBenefit = Math.max(data.dc.oil, data.dc.heatInRent);
      const sizeIdx = Math.min(Math.max(1, householdSize), 4) - 1;
      for (const fuel of Object.values(data.dc.payment)) {
        for (const housing of Object.values(fuel)) {
          for (const row of housing) maxBenefit = Math.max(maxBenefit, row[sizeIdx]);
        }
      }
      break;
    }
    case 'MA': {
      for (const table of Object.values(data.ma.standard)) {
        for (const row of table) maxBenefit = Math.max(maxBenefit, ...row);
      }
      break;
    }
    case 'IL': {
      const sizeIdx = Math.min(Math.max(1, householdSize), 6) - 1;
      for (const matrix of Object.values(data.il.matrices)) {
        for (const row of matrix) maxBenefit = Math.max(maxBenefit, row[sizeIdx]);
      }
      break;
    }
  }
  // Use 2.5x the max benefit so the flat plateau after the cap is clearly visible
  return Math.max(1000, Math.round(maxBenefit * 2.5 / 100) * 100);
}

export function generateSurface(params: {
  state: string;
  heatingType: string;
  householdSize: number;
  housingType?: string;
  subsidized?: boolean;
  gridSize?: number;
  data: LiheapData;
}): { incomes: number[]; expenses: number[]; benefits: number[][] } {
  const { state, heatingType, householdSize, housingType, subsidized, data: d } = params;
  const gridSize = params.gridSize || 30;

  const incomeMax = chartIncomeMax(state, householdSize, d);
  const expenseMax = chartExpenseMax(state, householdSize, d);
  const incomes = Array.from({ length: gridSize }, (_, i) => Math.round((i * incomeMax) / (gridSize - 1)));
  const expenses = Array.from({ length: gridSize }, (_, i) => Math.round((i * expenseMax) / (gridSize - 1)));

  const benefits = expenses.map((expense) =>
    incomes.map((income) =>
      computeBenefit({ state, heatingType, income, heatingExpense: expense, householdSize, housingType, subsidized }, d),
    ),
  );

  return { incomes, expenses, benefits };
}

export function generateIncomeLines(params: {
  state: string;
  householdSize: number;
  heatingExpense: number;
  housingType?: string;
  subsidized?: boolean;
  data: LiheapData;
  highlightIncome?: number;
}): Record<string, number>[] {
  const { state, householdSize, heatingExpense, housingType, subsidized, data: d, highlightIncome } = params;
  const types = CHART_HEATING_TYPES[state];

  const incomeMax = Math.max(chartIncomeMax(state, householdSize, d), (highlightIncome ?? 0) * 1.15);
  const steps = 150;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const income = Math.round((i * incomeMax) / steps);
    const point: Record<string, number> = { income };
    for (const ht of types) {
      point[ht.value] = computeBenefit(
        { state, heatingType: ht.value, income, heatingExpense, householdSize, housingType, subsidized }, d,
      );
    }
    return point;
  });
}

export function generateExpenseLines(params: {
  state: string;
  householdSize: number;
  income: number;
  housingType?: string;
  subsidized?: boolean;
  data: LiheapData;
  highlightExpense?: number;
}): Record<string, number>[] {
  const { state, householdSize, income, housingType, subsidized, data: d, highlightExpense } = params;
  const types = CHART_HEATING_TYPES[state];

  const expenseMax = Math.max(chartExpenseMax(state, householdSize, d), (highlightExpense ?? 0) * 1.15);
  const steps = 150;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const expense = Math.round((i * expenseMax) / steps);
    const point: Record<string, number> = { expense };
    for (const ht of types) {
      point[ht.value] = computeBenefit(
        { state, heatingType: ht.value, income, heatingExpense: expense, householdSize, housingType, subsidized }, d,
      );
    }
    return point;
  });
}

export function generateSizeSurface(params: {
  state: string;
  heatingType: string;
  heatingExpense: number;
  housingType?: string;
  subsidized?: boolean;
  data: LiheapData;
}): { incomes: number[]; sizes: number[]; benefits: number[][] } {
  const { state, heatingType, heatingExpense, housingType, subsidized, data: d } = params;

  const maxSize = state === 'DC' ? 4 : state === 'IL' ? 6 : 6;
  const sizes = Array.from({ length: maxSize }, (_, i) => i + 1);

  // Use the largest household size to determine the income range
  const incomeMax = chartIncomeMax(state, maxSize, d);
  const gridSize = 80;
  const incomes = Array.from({ length: gridSize }, (_, i) => Math.round((i * incomeMax) / (gridSize - 1)));

  const benefits = sizes.map((size) =>
    incomes.map((income) =>
      computeBenefit({ state, heatingType, income, heatingExpense, householdSize: size, housingType, subsidized }, d),
    ),
  );

  return { incomes, sizes, benefits };
}

export const CHART_HEATING_TYPES: Record<string, { label: string; value: string; color: string }[]> = {
  DC: [
    { label: 'Electricity', value: 'ELECTRICITY', color: 'var(--chart-1)' },
    { label: 'Natural Gas', value: 'GAS', color: 'var(--chart-2)' },
    { label: 'Oil ($1,500 flat)', value: 'OIL', color: 'var(--chart-3)' },
    { label: 'Heat in Rent ($250)', value: 'HEAT_IN_RENT', color: 'var(--chart-5)' },
  ],
  MA: [
    { label: 'Electricity', value: 'ELECTRICITY', color: 'var(--chart-1)' },
    { label: 'Natural Gas', value: 'NATURAL_GAS', color: 'var(--chart-2)' },
    { label: 'Heating Oil/Propane', value: 'HEATING_OIL_AND_PROPANE', color: 'var(--chart-3)' },
    { label: 'Kerosene', value: 'KEROSENE', color: 'var(--chart-4)' },
    { label: 'Heat in Rent', value: 'HEAT_IN_RENT', color: 'var(--chart-5)' },
  ],
  IL: [
    { label: 'All Electric', value: 'ALL_ELECTRIC', color: 'var(--chart-1)' },
    { label: 'Natural Gas', value: 'NAT_GAS_OTHER', color: 'var(--chart-2)' },
    { label: 'Propane/Fuel Oil', value: 'PROPANE_FUEL_OIL', color: 'var(--chart-3)' },
    { label: 'Cash (Heat in Rent)', value: 'CASH', color: 'var(--chart-5)' },
  ],
};
