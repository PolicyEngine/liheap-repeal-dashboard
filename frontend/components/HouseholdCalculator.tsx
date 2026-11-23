'use client';

import { useEffect, useState } from 'react';
import { Surface3DChart, SizeIncome3DChart, IncomeLineChart, SizeLineChart } from './BenefitCharts';
import type { Selection, StateGrid } from '@/lib/liheapGrid';
import {
  STATES, YEARS, ELECTRICITY, NO_HEATING,
  fuelUsesBill, loadStateGrid, lookup, maxIncome, snapExpense, snapIncome,
} from '@/lib/liheapGrid';

const fmt = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtInt = (v: number) => v.toLocaleString('en-US');
const parseInput = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;

export default function HouseholdCalculator() {
  const [state, setState] = useState('DC');
  const [year, setYear] = useState(YEARS[0].value);
  const [nAdults, setNAdults] = useState(1);
  const [nChildren, setNChildren] = useState(0);
  const [incomeInput, setIncomeInput] = useState(20000);
  const [fuelInput, setFuelInput] = useState(ELECTRICITY);
  const [expenseInput, setExpenseInput] = useState(1500);
  const [variantInput, setVariantInput] = useState(0);
  const [coolingInput, setCoolingInput] = useState(false);

  const [loaded, setLoaded] = useState<{ key: string; grid: StateGrid | null; error: string | null } | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [leftIs3d, setLeftIs3d] = useState(false);
  const [rightIs3d, setRightIs3d] = useState(false);

  const key = `${year}/${state}`;
  useEffect(() => {
    let current = true;
    loadStateGrid(year, state)
      .then((grid) => { if (current) setLoaded({ key, grid, error: null }); })
      .catch((error: Error) => {
        if (current) setLoaded({ key, grid: null, error: error.message });
      });
    return () => { current = false; };
  }, [year, state, key]);

  // Results for another state or year are never shown while a new file loads.
  const grid = loaded?.key === key ? loaded.grid : null;
  const loadError = loaded?.key === key ? loaded.error : null;
  const ready = grid !== null;

  // Inputs are limited to the households that were run for this state.
  const fuel = ready && grid.fuels.some((f) => f.value === fuelInput) ? fuelInput : ELECTRICITY;
  const selection: Selection | null = ready
    ? {
        adults: nAdults,
        children: nChildren,
        variant: Math.min(variantInput, grid.variants.length - 1),
        cooling: grid.coolingToggle && (coolingInput || fuel === NO_HEATING),
        fuel,
        expense: snapExpense(grid, expenseInput),
        income: snapIncome(grid, incomeInput),
      }
    : null;
  const result = ready && selection ? lookup(grid, selection) : null;

  const usesBill = fuelUsesBill(fuel);
  const billIsElectric = fuel === ELECTRICITY || fuel === NO_HEATING;
  const heatingPart = result ? result.benefit - result.coolingPart : 0;
  const isMichigan = state === 'MI';
  const incomeAboveRange = ready && incomeInput > maxIncome(grid);

  return (
    <section id="calculator" className="flex flex-col gap-3 xl:h-[calc(100vh-7rem)]">
      {/* ── Top bar: inputs + result ── */}
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-3">
        <div className="flex items-end gap-x-3 gap-y-2 flex-wrap">
          <Field label="State" grow htmlFor="state">
            <select id="state" value={state} onChange={(e) => setState(e.target.value)}
              className="field-input w-full">
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Field>

          <Field label="Program year" htmlFor="year">
            <select id="year" value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="field-input w-full">
              {YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </Field>

          <Field label="Marital status" htmlFor="adults">
            <select id="adults" value={nAdults} onChange={(e) => setNAdults(Number(e.target.value))}
              className="field-input w-full">
              <option value={1}>Single</option>
              <option value={2}>Married</option>
            </select>
          </Field>

          <Field label="Children" htmlFor="children">
            <select id="children" value={nChildren} onChange={(e) => setNChildren(Number(e.target.value))}
              className="field-input w-full">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>

          <Field label="Annual income" grow htmlFor="income">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input id="income" type="text" inputMode="numeric" value={fmtInt(incomeInput)}
                onChange={(e) => setIncomeInput(parseInput(e.target.value))}
                onBlur={() => { if (ready) setIncomeInput(snapIncome(grid, incomeInput)); }}
                className="field-input field-input-dollar w-full" />
            </div>
          </Field>

          <Field label="Heating" grow htmlFor="fuel">
            <select id="fuel" value={fuel} onChange={(e) => setFuelInput(e.target.value)}
              className="field-input w-full">
              {(ready ? grid.fuels : [{ value: ELECTRICITY, label: 'Electricity' }]).map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>

          {usesBill && (
            <Field label={billIsElectric ? 'Electric bill/yr' : 'Heating bill/yr'} htmlFor="expense">
              <select id="expense" value={selection?.expense ?? expenseInput}
                onChange={(e) => setExpenseInput(Number(e.target.value))}
                className="field-input w-full">
                {(ready ? grid.expenses : [expenseInput]).map((e) => (
                  <option key={e} value={e}>{fmt(e)}</option>
                ))}
              </select>
            </Field>
          )}

          {ready && grid.variants.length > 1 && (
            <Field label={grid.variantLabel} htmlFor="variant">
              <select id="variant" value={selection?.variant ?? 0}
                onChange={(e) => setVariantInput(Number(e.target.value))}
                className="field-input w-full">
                {grid.variants.map((v, i) => <option key={v.value} value={i}>{v.label}</option>)}
              </select>
            </Field>
          )}

          {ready && grid.coolingToggle && (
            <Field label="Pays for cooling" htmlFor="cooling">
              <label className="flex items-center h-[38px]">
                <input id="cooling" type="checkbox"
                  checked={selection?.cooling ?? false}
                  disabled={fuel === NO_HEATING}
                  onChange={(e) => setCoolingInput(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              </label>
            </Field>
          )}

          <button onClick={() => setHasCalculated(true)}
            aria-label="Calculate LIHEAP benefit estimate"
            className="h-[38px] bg-primary-600 text-white px-6 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors whitespace-nowrap shrink-0">
            Calculate
          </button>
        </div>

        {/* Result row: a lookup of the model run for these inputs */}
        {hasCalculated && result && selection && ready && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-x-4 gap-y-2 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${
              result.eligible
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${result.eligible ? 'bg-green-500' : 'bg-gray-400'}`} />
              {result.eligible ? 'Eligible' : 'Not eligible'}
            </div>

            {result.eligible && (
              <div className="flex items-baseline gap-2 ml-4">
                <span className="text-3xl font-bold text-primary-700 leading-none">{fmt(result.benefit)}</span>
                <span className="text-sm text-gray-500">
                  {isMichigan ? 'annual Home Heating Credit' : 'annual LIHEAP benefit'}
                </span>
              </div>
            )}

            {result.eligible && result.coolingPart > 0 && (
              <div className="text-sm text-gray-600 ml-2">
                {fmt(heatingPart)} heating + {fmt(result.coolingPart)} cooling
              </div>
            )}

            {result.eligible && usesBill && selection.expense > 0 && (
              <div className="flex items-baseline gap-2 ml-4 pl-4 border-l border-gray-200">
                <span className="text-2xl font-bold text-gray-700 leading-none">
                  {Math.round(Math.min(100, ((fuel === NO_HEATING ? result.benefit : heatingPart) / selection.expense) * 100))}%
                </span>
                <span className="text-sm text-gray-500">
                  of this {billIsElectric ? 'electric' : 'heating'} bill
                </span>
              </div>
            )}

            <p className="text-[11px] text-gray-400 ml-auto">
              At {fmt(selection.income)} income
              {incomeAboveRange ? ` (the highest income run for ${grid.name})` : ''}
              {grid.county ? ` · ${grid.county}` : ''}
              {grid.place ? ` · ${grid.place}` : ''}
              {' '}· regular payments only, no crisis or weatherization
            </p>
          </div>
        )}
        {loadError && (
          <p className="mt-3 pt-3 border-t border-gray-100 text-sm text-red-700">
            Could not load the data for this state. {loadError}
          </p>
        )}
      </div>

      {/* ── Charts: full width, equal split ── */}
      {!hasCalculated || !ready || !selection ? (
        <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white xl:min-h-0">
          <div className="text-center">
            {hasCalculated && !loadError ? (
              <p className="text-gray-400 text-sm">Loading…</p>
            ) : (
              <>
                <p className="text-gray-400 text-sm">Enter your household details above and click <strong>Calculate</strong></p>
                <p className="text-gray-300 text-xs mt-1">to see your estimated LIHEAP benefit and explore the benefit structure</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 xl:grid-cols-2">
          {/* Left panel: by income (2D) / income × bill surface (3D) */}
          <Panel
            title={leftIs3d ? 'Income × bill surface' : 'Benefit by income'}
            detail={leftIs3d || !usesBill ? '' : ` — at a ${fmt(selection.expense)}/yr bill`}
            is3d={leftIs3d}
            onToggle={() => setLeftIs3d(!leftIs3d)}
          >
            {leftIs3d
              ? <Surface3DChart grid={grid} selection={selection} />
              : <IncomeLineChart grid={grid} selection={selection} highlight={result?.eligible ?? false} />}
          </Panel>

          {/* Right panel: by household size (2D) / income × size surface (3D) */}
          <Panel
            title={rightIs3d ? 'Income × household size surface' : 'Benefit by household size'}
            detail={rightIs3d ? '' : ` — at ${fmt(selection.income)}/yr income`}
            is3d={rightIs3d}
            onToggle={() => setRightIs3d(!rightIs3d)}
          >
            {rightIs3d
              ? <SizeIncome3DChart grid={grid} selection={selection} />
              : <SizeLineChart grid={grid} selection={selection} highlight={result?.eligible ?? false} />}
          </Panel>
        </div>
      )}
    </section>
  );
}

function Panel({
  title, detail, is3d, onToggle, children,
}: { title: string; detail: string; is3d: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[24rem] flex-col rounded-lg border border-gray-200 bg-white p-3 xl:min-h-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-gray-700">
          {title}
          <span className="text-gray-400 font-normal">{detail}</span>
        </p>
        <button
          onClick={onToggle}
          className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
            is3d
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
          }`}
        >
          {is3d ? '2D' : '3D'}
        </button>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function Field({ label, children, grow, htmlFor }: { label: string; children: React.ReactNode; grow?: boolean; htmlFor?: string }) {
  return (
    <div className={grow ? 'flex-1 min-w-[9.5rem]' : 'min-w-[6.5rem]'}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
