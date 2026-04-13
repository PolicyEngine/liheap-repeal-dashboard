/**
 * LIHEAP benefit matrices and computation for DC, MA, and IL.
 * Data sourced from policyengine-us YAML parameter files (FY2024 values).
 */

// ===== Federal Poverty Level 2024 =====

const FPL_BASE = 15060;
const FPL_INCREMENT = 5380;

export function getFPL(householdSize: number): number {
  return FPL_BASE + FPL_INCREMENT * (Math.max(1, householdSize) - 1);
}

// ===== DC: Income levels & payment matrices =====

// Income level = ceil(income / 2000), capped at 1-10
function dcIncomeLevel(income: number): number {
  if (income <= 0) return 1;
  return Math.min(10, Math.ceil(income / 2000));
}

// Payment matrices: [incomeLevel 1-10][householdSize 1-4]
const DC_PAYMENT: Record<string, Record<string, number[][]>> = {
  ELECTRICITY: {
    MULTI_FAMILY: [
      [729, 857, 943, 1071],
      [694, 816, 898, 1020],
      [653, 768, 845, 960],
      [632, 744, 818, 930],
      [469, 552, 607, 690],
      [449, 528, 581, 660],
      [367, 432, 475, 540],
      [347, 408, 449, 510],
      [306, 360, 396, 450],
      [250, 250, 250, 250],
    ],
    SINGLE_FAMILY: [
      [948, 1116, 1227, 1394],
      [903, 1063, 1169, 1328],
      [850, 1000, 1100, 1250],
      [823, 969, 1066, 1211],
      [611, 719, 791, 898],
      [584, 688, 756, 859],
      [478, 563, 619, 703],
      [452, 531, 584, 664],
      [398, 469, 516, 586],
      [250, 250, 250, 273],
    ],
  },
  GAS: {
    MULTI_FAMILY: [
      [1045, 1229, 1290, 1536],
      [995, 1170, 1229, 1463],
      [918, 1080, 1134, 1350],
      [842, 990, 1040, 1238],
      [765, 900, 945, 1125],
      [727, 855, 898, 1069],
      [689, 810, 851, 1013],
      [650, 765, 803, 956],
      [574, 675, 709, 844],
      [459, 540, 567, 675],
    ],
    SINGLE_FAMILY: [
      [1277, 1502, 1577, 1800],
      [1216, 1430, 1502, 1788],
      [1122, 1320, 1386, 1650],
      [1029, 1210, 1271, 1513],
      [935, 1100, 1155, 1375],
      [888, 1045, 1097, 1306],
      [842, 990, 1040, 1238],
      [795, 935, 982, 1169],
      [701, 825, 866, 1031],
      [561, 660, 693, 825],
    ],
  },
};

const DC_OIL = 1500;
const DC_HEAT_IN_RENT = 250;

function computeDCBenefit(
  heatingType: string,
  income: number,
  heatingExpense: number,
  householdSize: number,
  housingType: string,
): number {
  if (heatingType === 'HEAT_IN_RENT') return DC_HEAT_IN_RENT;
  if (heatingType === 'OIL') return Math.min(DC_OIL, heatingExpense);

  const level = dcIncomeLevel(income);
  const sizeIdx = Math.min(Math.max(1, householdSize), 4) - 1;
  const matrix = DC_PAYMENT[heatingType]?.[housingType];
  if (!matrix) return 0;

  const matrixAmount = matrix[level - 1][sizeIdx];
  return Math.min(matrixAmount, heatingExpense);
}

// ===== MA: Benefit levels & payment tables =====

// Benefit level from income/FPG ratio (1-6)
function maBenefitLevel(income: number, householdSize: number): number {
  const ratio = income / getFPL(householdSize);
  if (ratio < 1.0) return 1;
  if (ratio < 1.25) return 2;
  if (ratio < 1.5) return 3;
  if (ratio < 1.75) return 4;
  if (ratio < 2.0) return 5;
  return 6;
}

// Standard payment: [benefitLevel 1-6][0=utility, 1=deliverable] (FY2025 / 2024-10-01)
const MA_STANDARD: Record<string, number[][]> = {
  non_subsidized: [
    [1025, 1500],
    [902, 1320],
    [794, 1162],
    [699, 1022],
    [699, 1022],
    [615, 900],
  ],
  subsidized: [
    [718, 1050],
    [631, 924],
    [556, 813],
    [489, 716],
    [489, 716],
    [430, 630],
  ],
};

// HECS amounts by benefit level (2022-10-01)
const MA_HECS = [200, 180, 160, 140, 140, 120];

const MA_DELIVERABLE_TYPES = ['HEATING_OIL_AND_PROPANE', 'KEROSENE', 'OTHER'];

function computeMABenefit(
  heatingType: string,
  income: number,
  heatingExpense: number,
  householdSize: number,
  subsidized: boolean,
): number {
  const level = maBenefitLevel(income, householdSize);
  const isDeliverable = MA_DELIVERABLE_TYPES.includes(heatingType);
  const fuelIdx = isDeliverable ? 1 : 0;

  const table = subsidized ? MA_STANDARD.subsidized : MA_STANDARD.non_subsidized;
  const standardPayment = table[level - 1][fuelIdx];

  // Include HECS in chart (assumes prior-year expense qualifies)
  const hecsPayment = MA_HECS[level - 1];
  const totalPayment = standardPayment + hecsPayment;

  if (heatingType === 'HEAT_IN_RENT') return standardPayment; // no cap, no HECS
  return Math.min(totalPayment, heatingExpense);
}

// ===== IL: Income brackets & payment matrices =====

// Income bracket from income/FPL ratio (1-4, 0=ineligible)
function ilIncomeBracket(income: number, householdSize: number): number {
  const ratio = income / getFPL(householdSize);
  if (ratio < 0.51) return 1;
  if (ratio < 1.01) return 2;
  if (ratio < 1.51) return 3;
  if (ratio <= 2.0) return 4;
  return 0;
}

// Payment matrices: [bracket 1-4][householdSize 1-6] (2023-10-01)
const IL_PAYMENT: Record<string, number[][]> = {
  ALL_ELECTRIC: [
    [840, 890, 940, 990, 1040, 1090],
    [530, 560, 620, 680, 720, 770],
    [370, 390, 430, 470, 500, 540],
    [300, 320, 350, 380, 400, 440],
  ],
  NAT_GAS_OTHER: [
    [1260, 1360, 1460, 1560, 1660, 1760],
    [610, 640, 690, 750, 790, 830],
    [420, 450, 480, 520, 550, 570],
    [340, 380, 420, 470, 510, 550],
  ],
  PROPANE_FUEL_OIL: [
    [1520, 1620, 1720, 1820, 1920, 2020],
    [710, 750, 820, 910, 950, 1010],
    [490, 520, 570, 630, 660, 700],
    [340, 380, 420, 470, 510, 550],
  ],
  CASH: [
    [630, 680, 730, 780, 830, 880],
    [305, 320, 345, 375, 395, 415],
    [210, 225, 240, 260, 275, 285],
    [170, 190, 210, 235, 255, 275],
  ],
};

function computeILBenefit(
  heatingType: string,
  income: number,
  heatingExpense: number,
  householdSize: number,
): number {
  const bracket = ilIncomeBracket(income, householdSize);
  if (bracket === 0) return 0;

  const sizeIdx = Math.min(Math.max(1, householdSize), 6) - 1;
  const matrix = IL_PAYMENT[heatingType];
  if (!matrix) return 0;

  const matrixAmount = matrix[bracket - 1][sizeIdx];
  if (heatingType === 'CASH') return matrixAmount; // no cap for heat-in-rent
  return Math.min(matrixAmount, heatingExpense);
}

// ===== Public API =====

export interface BenefitParams {
  state: string;
  heatingType: string;
  income: number;
  heatingExpense: number;
  householdSize: number;
  housingType?: string;
  subsidized?: boolean;
}

export function computeBenefit(p: BenefitParams): number {
  switch (p.state) {
    case 'DC':
      return computeDCBenefit(
        p.heatingType, p.income, p.heatingExpense,
        p.householdSize, p.housingType || 'MULTI_FAMILY',
      );
    case 'MA':
      return computeMABenefit(
        p.heatingType, p.income, p.heatingExpense,
        p.householdSize, p.subsidized || false,
      );
    case 'IL':
      return computeILBenefit(
        p.heatingType, p.income, p.heatingExpense, p.householdSize,
      );
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
}): { incomes: number[]; expenses: number[]; benefits: number[][] } {
  const { state, heatingType, householdSize, housingType, subsidized } = params;
  const gridSize = params.gridSize || 35;

  // Income range: cover meaningful range for each state
  let incomeMax: number;
  if (state === 'IL') {
    incomeMax = getFPL(householdSize) * 2.15;
  } else if (state === 'DC') {
    incomeMax = 25000; // Covers all 10 income levels ($2K increments)
  } else {
    incomeMax = getFPL(householdSize) * 2.5;
  }

  const expenseMax = 5000;

  const incomes = Array.from({ length: gridSize }, (_, i) =>
    Math.round((i * incomeMax) / (gridSize - 1)),
  );
  const expenses = Array.from({ length: gridSize }, (_, i) =>
    Math.round((i * expenseMax) / (gridSize - 1)),
  );

  // z[expenseIdx][incomeIdx] = benefit
  const benefits = expenses.map((expense) =>
    incomes.map((income) =>
      computeBenefit({ state, heatingType, income, heatingExpense: expense, householdSize, housingType, subsidized }),
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
}): Record<string, number>[] {
  const { state, householdSize, heatingExpense, housingType, subsidized } = params;
  const types = CHART_HEATING_TYPES[state];

  let incomeMax: number;
  if (state === 'IL') {
    incomeMax = getFPL(householdSize) * 2.15;
  } else if (state === 'DC') {
    incomeMax = 25000;
  } else {
    incomeMax = getFPL(householdSize) * 2.5;
  }
  const steps = 150;

  return Array.from({ length: steps + 1 }, (_, i) => {
    const income = Math.round((i * incomeMax) / steps);
    const point: Record<string, number> = { income };
    for (const ht of types) {
      point[ht.value] = computeBenefit({
        state,
        heatingType: ht.value,
        income,
        heatingExpense,
        householdSize,
        housingType,
        subsidized,
      });
    }
    return point;
  });
}

// Heating types per state with chart colors
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
