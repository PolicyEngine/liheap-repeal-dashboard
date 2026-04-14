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

// ===== Hardcoded defaults (FY2024 values) =====

const DEFAULT_DATA: LiheapData = {
  dc: {
    incomeIncrement: 2000,
    heatInRent: 250,
    oil: 1500,
    payment: {
      ELECTRICITY: {
        MULTI_FAMILY: [
          [729, 857, 943, 1071], [694, 816, 898, 1020], [653, 768, 845, 960],
          [632, 744, 818, 930], [469, 552, 607, 690], [449, 528, 581, 660],
          [367, 432, 475, 540], [347, 408, 449, 510], [306, 360, 396, 450],
          [250, 250, 250, 250],
        ],
        SINGLE_FAMILY: [
          [948, 1116, 1227, 1394], [903, 1063, 1169, 1328], [850, 1000, 1100, 1250],
          [823, 969, 1066, 1211], [611, 719, 791, 898], [584, 688, 756, 859],
          [478, 563, 619, 703], [452, 531, 584, 664], [398, 469, 516, 586],
          [250, 250, 250, 273],
        ],
      },
      GAS: {
        MULTI_FAMILY: [
          [1045, 1229, 1290, 1536], [995, 1170, 1229, 1463], [918, 1080, 1134, 1350],
          [842, 990, 1040, 1238], [765, 900, 945, 1125], [727, 855, 898, 1069],
          [689, 810, 851, 1013], [650, 765, 803, 956], [574, 675, 709, 844],
          [459, 540, 567, 675],
        ],
        SINGLE_FAMILY: [
          [1277, 1502, 1577, 1800], [1216, 1430, 1502, 1788], [1122, 1320, 1386, 1650],
          [1029, 1210, 1271, 1513], [935, 1100, 1155, 1375], [888, 1045, 1097, 1306],
          [842, 990, 1040, 1238], [795, 935, 982, 1169], [701, 825, 866, 1031],
          [561, 660, 693, 825],
        ],
      },
    },
  },
  ma: {
    standard: {
      non_subsidized: [
        [1025, 1500], [902, 1320], [794, 1162], [699, 1022], [699, 1022], [615, 900],
      ],
      subsidized: [
        [718, 1050], [631, 924], [556, 813], [489, 716], [489, 716], [430, 630],
      ],
    },
    hecs: [200, 180, 160, 140, 140, 120],
  },
  il: {
    matrices: {
      ALL_ELECTRIC: [
        [840, 890, 940, 990, 1040, 1090], [530, 560, 620, 680, 720, 770],
        [370, 390, 430, 470, 500, 540], [300, 320, 350, 380, 400, 440],
      ],
      NAT_GAS_OTHER: [
        [1260, 1360, 1460, 1560, 1660, 1760], [610, 640, 690, 750, 790, 830],
        [420, 450, 480, 520, 550, 570], [340, 380, 420, 470, 510, 550],
      ],
      PROPANE_FUEL_OIL: [
        [1520, 1620, 1720, 1820, 1920, 2020], [710, 750, 820, 910, 950, 1010],
        [490, 520, 570, 630, 660, 700], [340, 380, 420, 470, 510, 550],
      ],
      CASH: [
        [630, 680, 730, 780, 830, 880], [305, 320, 345, 375, 395, 415],
        [210, 225, 240, 260, 275, 285], [170, 190, 210, 235, 255, 275],
      ],
    },
    bracketThresholds: [0, 0.51, 1.01, 1.51],
  },
};

// ===== Parse live data from API metadata =====

/** Get the most recent value from a parameter's values object. */
function latestValue(values: Record<string, number>): number {
  const dates = Object.keys(values).sort();
  return values[dates[dates.length - 1]];
}

/**
 * Parse the PolicyEngine /us/metadata response into LiheapData.
 * Falls back to defaults for any missing parameters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMetadata(params: Record<string, any>): LiheapData {
  const get = (key: string): number | undefined => {
    const p = params[key];
    if (!p?.values) return undefined;
    return latestValue(p.values);
  };

  // ── DC ──
  const dcIncrement = get('gov.states.dc.doee.liheap.income_level_increment') ?? DEFAULT_DATA.dc.incomeIncrement;
  const dcHeatInRent = get('gov.states.dc.doee.liheap.payment.heat_in_rent') ?? DEFAULT_DATA.dc.heatInRent;
  const dcOil = get('gov.states.dc.doee.liheap.payment.oil') ?? DEFAULT_DATA.dc.oil;

  const dcPayment: Record<string, Record<string, number[][]>> = {};
  for (const fuel of ['electricity', 'gas']) {
    const fuelKey = fuel === 'electricity' ? 'ELECTRICITY' : 'GAS';
    dcPayment[fuelKey] = {};
    for (const housing of ['MULTI_FAMILY', 'SINGLE_FAMILY']) {
      const matrix: number[][] = [];
      for (let level = 1; level <= 10; level++) {
        const row: number[] = [];
        for (let size = 1; size <= 4; size++) {
          const key = `gov.states.dc.doee.liheap.payment.${fuel}.${housing}.${level}.${size}`;
          row.push(get(key) ?? DEFAULT_DATA.dc.payment[fuelKey]?.[housing]?.[level - 1]?.[size - 1] ?? 0);
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
      const utility = get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${lvl}.UTILITY_AND_HEAT_IN_RENT`)
        ?? DEFAULT_DATA.ma.standard[sub]?.[lvl - 1]?.[0] ?? 0;
      const deliverable = get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${lvl}.DELIVERABLE_FUEL`)
        ?? DEFAULT_DATA.ma.standard[sub]?.[lvl - 1]?.[1] ?? 0;
      levels.push([utility, deliverable]);
    }
    maStandard[sub] = levels;
  }

  const maHecs: number[] = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    maHecs.push(get(`gov.states.ma.doer.liheap.hecs.amount.non_subsidized.${lvl}`) ?? DEFAULT_DATA.ma.hecs[lvl - 1] ?? 0);
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
        const key = `gov.states.il.dceo.liheap.payment.matrix.${paramFuel}.${bracket}.${size}`;
        row.push(get(key) ?? DEFAULT_DATA.il.matrices[fuelKey]?.[bracket - 1]?.[size - 1] ?? 0);
      }
      matrix.push(row);
    }
    ilMatrices[fuelKey] = matrix;
  }

  const ilThresholds: number[] = [];
  for (let i = 0; i < 4; i++) {
    ilThresholds.push(get(`gov.states.il.dceo.liheap.payment.income_bracket[${i}].threshold`) ?? DEFAULT_DATA.il.bracketThresholds[i]);
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

export function computeBenefit(p: BenefitParams, data: LiheapData = DEFAULT_DATA): number {
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
  data?: LiheapData;
}): { incomes: number[]; expenses: number[]; benefits: number[][] } {
  const { state, heatingType, householdSize, housingType, subsidized, data } = params;
  const gridSize = params.gridSize || 30;
  const d = data || DEFAULT_DATA;

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
  data?: LiheapData;
}): Record<string, number>[] {
  const { state, householdSize, heatingExpense, housingType, subsidized, data } = params;
  const types = CHART_HEATING_TYPES[state];
  const d = data || DEFAULT_DATA;

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
