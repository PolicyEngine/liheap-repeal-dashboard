/**
 * LIHEAP benefits for every state, read from files precomputed with a local
 * policyengine-us (scripts/generate_liheap_grids.py).
 *
 * Every value is one model run for one household. Nothing here interpolates:
 * the calculator's inputs are limited to the steps that were run.
 */

export const STATES: { code: string; name: string }[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

/** Program years with data. Period 2027 is October 2026 to September 2027. */
export const YEARS = [
  { value: 2027, label: '2026–27' },
  { value: 2026, label: '2025–26' },
];

export const HEAT_IN_RENT = 'HEAT_IN_RENT';
export const NO_HEATING = 'NONE';
export const ELECTRICITY = 'ELECTRICITY';

export interface StateGrid {
  state: string;
  name: string;
  year: number;
  benefitVariable: string;
  eligibilityVariable: string | null;
  county: string | null;
  place: string | null;
  /** [adults, children] */
  compositions: [number, number][];
  incomeStep: number;
  incomeCount: number;
  benefitsBeyondRange: boolean;
  fuels: { value: string; label: string }[];
  expenses: number[];
  /** [position in fuels, yearly bill] */
  options: [number, number][];
  coolingToggle: boolean;
  coolingVariable: string | null;
  variantLabel: string;
  variants: { value: string; label: string }[];
  /** Run-length encoded: [value, count, value, count, ...] */
  curves: number[][];
  eligibleCurves: number[][];
  /** [cooling][variant][composition][option] -> position in curves */
  index: number[][][][];
  coolingIndex: number[][][][] | null;
  eligibleIndex: number[][][][];
  model: { package: string; version: string | null; commit: string | null };
}

export interface Selection {
  adults: number;
  children: number;
  /** Position in grid.variants */
  variant: number;
  cooling: boolean;
  fuel: string;
  /** One of grid.expenses; ignored when heat is in the rent */
  expense: number;
  /** A multiple of grid.incomeStep within the grid's range */
  income: number;
}

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  (process.env.NODE_ENV === 'production' ? '/liheap-repeal-dashboard' : '');

const gridCache = new Map<string, Promise<StateGrid>>();

export function loadStateGrid(year: number, state: string): Promise<StateGrid> {
  const key = `${year}/${state}`;
  let pending = gridCache.get(key);
  if (!pending) {
    pending = fetch(`${BASE_PATH}/data/liheap/${key}.json`).then((res) => {
      if (!res.ok) throw new Error(`No data for ${state} in ${year} (${res.status})`);
      return res.json() as Promise<StateGrid>;
    });
    pending.catch(() => gridCache.delete(key));
    gridCache.set(key, pending);
  }
  return pending;
}

const decoded = new WeakMap<number[], number[]>();

function decode(runs: number[]): number[] {
  let values = decoded.get(runs);
  if (!values) {
    values = [];
    for (let i = 0; i < runs.length; i = i + 2) {
      for (let n = 0; n < runs[i + 1]; n = n + 1) values.push(runs[i]);
    }
    decoded.set(runs, values);
  }
  return values;
}

export function maxIncome(grid: StateGrid): number {
  return (grid.incomeCount - 1) * grid.incomeStep;
}

/** Snap an income to a step that was run. */
export function snapIncome(grid: StateGrid, income: number): number {
  const snapped = Math.round(income / grid.incomeStep) * grid.incomeStep;
  return Math.min(Math.max(0, snapped), maxIncome(grid));
}

export function snapExpense(grid: StateGrid, expense: number): number {
  return grid.expenses.reduce((best, e) =>
    Math.abs(e - expense) < Math.abs(best - expense) ? e : best,
  );
}

function compositionIndex(grid: StateGrid, adults: number, children: number): number {
  return grid.compositions.findIndex(([a, c]) => a === adults && c === children);
}

/** A fuel has one bill level when the bill is not an input (heat in rent). */
export function fuelUsesBill(fuel: string): boolean {
  return fuel !== HEAT_IN_RENT;
}

function optionIndex(grid: StateGrid, fuel: string, expense: number): number {
  const fuelPosition = grid.fuels.findIndex((f) => f.value === fuel);
  return grid.options.findIndex(
    ([f, e]) => f === fuelPosition && (!fuelUsesBill(fuel) || e === expense),
  );
}

type Key = { adults: number; children: number; variant: number; cooling: boolean; fuel: string; expense: number };

interface Curves {
  benefit: number[];
  cooling: number[] | null;
  eligible: number[];
}

/** The model's results at every income step for one household and fuel. */
function curvesFor(grid: StateGrid, key: Key): Curves | null {
  const comp = compositionIndex(grid, key.adults, key.children);
  const option = optionIndex(grid, key.fuel, key.expense);
  if (comp < 0 || option < 0) return null;
  const cool = grid.coolingToggle && key.cooling ? 1 : 0;
  const variant = Math.min(key.variant, grid.variants.length - 1);
  return {
    benefit: decode(grid.curves[grid.index[cool][variant][comp][option]]),
    cooling: grid.coolingIndex
      ? decode(grid.curves[grid.coolingIndex[cool][variant][comp][option]])
      : null,
    eligible: decode(grid.eligibleCurves[grid.eligibleIndex[cool][variant][comp][option]]),
  };
}

export interface Result {
  benefit: number;
  /** The separate cooling benefit included in `benefit` */
  coolingPart: number;
  eligible: boolean;
}

export function lookup(grid: StateGrid, s: Selection): Result | null {
  const curves = curvesFor(grid, s);
  const i = Math.round(s.income / grid.incomeStep);
  if (!curves || i < 0 || i >= grid.incomeCount) return null;
  return {
    benefit: curves.benefit[i],
    coolingPart: curves.cooling ? curves.cooling[i] : 0,
    eligible: curves.eligible[i] === 1,
  };
}

// ===== Chart series =====

export interface Series {
  key: string;
  label: string;
  /** Fuel values drawn by this line (fuels with identical results share one) */
  fuels: string[];
  color: string;
  dashed: boolean;
}

const COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)',
];

/** One line per distinct result, so fuels the state treats alike are not overdrawn. */
function groupFuels(grid: StateGrid, valuesByFuel: Map<string, number[]>): Series[] {
  const groups: { signature: string; fuels: string[] }[] = [];
  for (const fuel of grid.fuels) {
    const values = valuesByFuel.get(fuel.value);
    if (!values) continue;
    const signature = values.join(',');
    const group = groups.find((g) => g.signature === signature);
    if (group) group.fuels.push(fuel.value);
    else groups.push({ signature, fuels: [fuel.value] });
  }
  return groups.map((group, i) => {
    const labels = group.fuels.map(
      (value) => grid.fuels.find((f) => f.value === value)?.label ?? value,
    );
    return {
      key: `s${i}`,
      label: labels.length === grid.fuels.length ? 'All heating sources' : labels.join(', '),
      fuels: group.fuels,
      color: COLORS[i % COLORS.length],
      dashed: i >= COLORS.length,
    };
  });
}

export interface ChartData {
  series: Series[];
  rows: Record<string, number>[];
}

type Shared = Omit<Selection, 'fuel' | 'income'>;

/**
 * How many income steps to draw: just past the last step with a payment, and
 * far enough to include `income`. The state's range is set by its largest
 * household, so smaller ones would otherwise show a long run of zeros.
 */
function visibleSteps(grid: StateGrid, curves: number[][], income = 0): number {
  let last = Math.round(income / grid.incomeStep);
  for (const curve of curves) {
    for (let i = curve.length - 1; i > last; i = i - 1) {
      if (curve[i] > 0) { last = i; break; }
    }
  }
  const margin = Math.max(4, Math.ceil(last * 0.12));
  const tick = 5000 / grid.incomeStep;
  const rounded = Math.ceil((last + margin) / tick) * tick;
  return Math.min(grid.incomeCount, rounded + 1);
}

/** Benefit at each income step, one line per group of fuels. */
export function incomeLines(grid: StateGrid, s: Shared, income = 0): ChartData {
  const byFuel = new Map<string, number[]>();
  for (const fuel of grid.fuels) {
    const curves = curvesFor(grid, { ...s, fuel: fuel.value });
    if (curves) byFuel.set(fuel.value, curves.benefit);
  }
  const series = groupFuels(grid, byFuel);
  const steps = visibleSteps(grid, Array.from(byFuel.values()), income);
  const rows = Array.from({ length: steps }, (_, i) => {
    const row: Record<string, number> = { income: i * grid.incomeStep };
    for (const line of series) row[line.key] = byFuel.get(line.fuels[0])![i];
    return row;
  });
  return { series, rows };
}

/** Benefit by household size (the chosen number of adults plus 0 to 6 children). */
export function sizeLines(grid: StateGrid, s: Omit<Selection, 'fuel' | 'children'>): ChartData {
  const i = Math.round(s.income / grid.incomeStep);
  const childCounts = grid.compositions
    .filter(([adults]) => adults === s.adults)
    .map(([, children]) => children);
  const byFuel = new Map<string, number[]>();
  for (const fuel of grid.fuels) {
    const values: number[] = [];
    for (const children of childCounts) {
      const curves = curvesFor(grid, { ...s, children, fuel: fuel.value });
      if (curves) values.push(curves.benefit[i]);
    }
    if (values.length === childCounts.length) byFuel.set(fuel.value, values);
  }
  const series = groupFuels(grid, byFuel);
  const rows = childCounts.map((children, n) => {
    const row: Record<string, number> = { size: s.adults + children };
    for (const line of series) row[line.key] = byFuel.get(line.fuels[0])![n];
    return row;
  });
  return { series, rows };
}

/** Benefit over income and bill level for one fuel. */
export function incomeExpenseSurface(grid: StateGrid, s: Omit<Selection, 'expense' | 'income'>) {
  const expenses = fuelUsesBill(s.fuel) ? grid.expenses : [0];
  const curves = expenses.map(
    (expense) => curvesFor(grid, { ...s, expense })?.benefit ?? [],
  );
  const steps = visibleSteps(grid, curves);
  const incomes = Array.from({ length: steps }, (_, i) => i * grid.incomeStep);
  return { incomes, expenses, benefits: curves.map((curve) => curve.slice(0, steps)) };
}

/** Benefit over income and household size for one fuel and bill. */
export function incomeSizeSurface(grid: StateGrid, s: Omit<Selection, 'children' | 'income'>) {
  const childCounts = grid.compositions
    .filter(([adults]) => adults === s.adults)
    .map(([, children]) => children);
  const sizes = childCounts.map((children) => s.adults + children);
  const curves = childCounts.map(
    (children) => curvesFor(grid, { ...s, children })?.benefit ?? [],
  );
  const steps = visibleSteps(grid, curves);
  const incomes = Array.from({ length: steps }, (_, i) => i * grid.incomeStep);
  return { incomes, sizes, benefits: curves.map((curve) => curve.slice(0, steps)) };
}
