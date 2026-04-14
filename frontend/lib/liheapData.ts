/**
 * LIHEAP benefit matrices and computation for DC, MA, and IL.
 *
 * Data can come from two sources:
 * 1. Hardcoded defaults (bundled, instant)
 * 2. Live API metadata (fetched at runtime, always up-to-date)
 *
 * The compute functions accept an optional LiheapData parameter.
 * If omitted, hardcoded defaults are used.
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
    /** hecs[level 0-5] = amount */
    hecs: number[];
  };
  il: {
    /** matrices[fuelType][bracket 0-3] = number[6 sizes] */
    matrices: Record<string, number[][]>;
    /** FPL ratio thresholds for brackets 1-4 */
    bracketThresholds: number[];
  };
}

// ===== Federal Poverty Level =====

const FPL_BASE = 15060;
const FPL_INCREMENT = 5380;

export function getFPL(householdSize: number): number {
  return FPL_BASE + FPL_INCREMENT * (Math.max(1, householdSize) - 1);
}


// ===== Parse live data from API metadata =====

/** Get the most recent value from a parameter's values object. */
function latestValue(values: Record<string, number>): number {
  const dates = Object.keys(values).sort();
  return values[dates[dates.length - 1]];
}

/**
 * Parse the PolicyEngine /us/metadata response into LiheapData.
 * All values come from the API -- no hardcoded fallbacks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMetadata(params: Record<string, any>): LiheapData {
  const get = (key: string): number => {
    const p = params[key];
    if (!p?.values) return 0;
    return latestValue(p.values);
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

  return {
    dc: { incomeIncrement: dcIncrement, heatInRent: dcHeatInRent, oil: dcOil, payment: dcPayment },
    ma: { standard: maStandard, hecs: maHecs },
    il: { matrices: ilMatrices, bracketThresholds: ilThresholds },
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

function dcIncomeLevel(income: number, increment: number): number {
  if (income <= 0) return 1;
  return Math.min(10, Math.ceil(income / increment));
}

function maBenefitLevel(income: number, householdSize: number): number {
  const ratio = income / getFPL(householdSize);
  if (ratio < 1.0) return 1;
  if (ratio < 1.25) return 2;
  if (ratio < 1.5) return 3;
  if (ratio < 1.75) return 4;
  if (ratio < 2.0) return 5;
  return 6;
}

function ilIncomeBracket(income: number, householdSize: number, thresholds: number[]): number {
  const ratio = income / getFPL(householdSize);
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
      const level = maBenefitLevel(p.income, p.householdSize);
      const isDeliverable = MA_DELIVERABLE_TYPES.includes(p.heatingType);
      const fuelIdx = isDeliverable ? 1 : 0;
      const table = p.subsidized ? ma.standard.subsidized : ma.standard.non_subsidized;
      const standardPayment = table[level - 1][fuelIdx];
      const hecsPayment = ma.hecs[level - 1];
      if (p.heatingType === 'HEAT_IN_RENT') return standardPayment;
      return Math.min(standardPayment + hecsPayment, p.heatingExpense);
    }
    case 'IL': {
      const { il } = data;
      const ratio = p.income / getFPL(p.householdSize);
      if (ratio > 2.0) return 0;
      const bracket = ilIncomeBracket(p.income, p.householdSize, il.bracketThresholds);
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

  let incomeMax: number;
  if (state === 'IL') incomeMax = getFPL(householdSize) * 2.15;
  else if (state === 'DC') incomeMax = d.dc.incomeIncrement * 12;
  else incomeMax = getFPL(householdSize) * 2.5;

  const expenseMax = 5000;
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
}): Record<string, number>[] {
  const { state, householdSize, heatingExpense, housingType, subsidized, data: d } = params;
  const types = CHART_HEATING_TYPES[state];

  let incomeMax: number;
  if (state === 'IL') incomeMax = getFPL(householdSize) * 2.15;
  else if (state === 'DC') incomeMax = d.dc.incomeIncrement * 12;
  else incomeMax = getFPL(householdSize) * 2.5;

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
