'use client';

import { useState } from 'react';
import { Surface3DChart, SizeIncome3DChart, IncomeLineChart, SizeLineChart } from './BenefitCharts';
import type { LiheapData } from '@/lib/liheapData';
import { FALLBACK_LIHEAP_DATA, computeBenefit, isEligible, CHART_HEATING_TYPES } from '@/lib/liheapData';

const STATES = [
  { code: 'DC', label: 'Washington DC' },
  { code: 'MA', label: 'Massachusetts' },
  { code: 'IL', label: 'Illinois' },
];

const HEATING_SOURCES: Record<string, { label: string; value: string }[]> = {
  DC: [
    { label: 'Electricity', value: 'ELECTRICITY' },
    { label: 'Natural Gas', value: 'GAS' },
    { label: 'Oil', value: 'OIL' },
    { label: 'Heat included in rent', value: 'HEAT_IN_RENT' },
  ],
  MA: [
    { label: 'Electricity', value: 'ELECTRICITY' },
    { label: 'Natural Gas', value: 'NATURAL_GAS' },
    { label: 'Heating Oil / Propane', value: 'HEATING_OIL_AND_PROPANE' },
    { label: 'Kerosene', value: 'KEROSENE' },
    { label: 'Other', value: 'OTHER' },
    { label: 'Heat included in rent', value: 'HEAT_IN_RENT' },
  ],
  IL: [
    { label: 'All Electric', value: 'ALL_ELECTRIC' },
    { label: 'Natural Gas', value: 'NAT_GAS_OTHER' },
    { label: 'Propane / Fuel Oil', value: 'PROPANE_FUEL_OIL' },
    { label: 'Heat included in rent', value: 'CASH' },
  ],
};

export default function HouseholdCalculator() {
  const [state, setState] = useState('DC');
  const [nAdults, setNAdults] = useState(1);
  const [nChildren, setNChildren] = useState(0);
  const [income, setIncome] = useState(20000);
  const [heatingSource, setHeatingSource] = useState('ELECTRICITY');
  const [heatingExpense, setHeatingExpense] = useState(1800);
  const [rent, setRent] = useState(0);
  const [dcHousingType, setDcHousingType] = useState('MULTI_FAMILY');
  const [receivesHousingAssistance, setReceivesHousingAssistance] = useState(false);
  const [heatingExpenseLastYear, setHeatingExpenseLastYear] = useState(0);

  const [hasCalculated, setHasCalculated] = useState(false);

  const [liheapData] = useState<LiheapData>(FALLBACK_LIHEAP_DATA);
  const [leftIs3d, setLeftIs3d] = useState(false);
  const [rightIs3d, setRightIs3d] = useState(false);

  const isHeatInRent = heatingSource === 'HEAT_IN_RENT' || heatingSource === 'CASH';
  const householdSize = nAdults + nChildren;

  // Local instant computation — updates as inputs change
  const localEligible = isEligible(state, income, householdSize, liheapData);
  const localBenefit = localEligible ? computeBenefit({
    state, heatingType: heatingSource, income,
    heatingExpense: isHeatInRent ? 99999 : heatingExpense,
    householdSize, housingType: dcHousingType, subsidized: receivesHousingAssistance,
  }, liheapData) : 0;

  function handleStateChange(newState: string) {
    setState(newState);
    setHeatingSource(HEATING_SOURCES[newState][0].value);
  }

  function calculate() {
    setHasCalculated(true);
  }

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  // Format number with commas for display; parse by stripping non-digits
  const fmtInt = (v: number) => v.toLocaleString('en-US');
  const parseInput = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;

  return (
    <section id="calculator" className="flex flex-col gap-3 xl:h-[calc(100vh-7rem)]">
      {/* ── Top bar: inputs + result ── */}
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-3">
        <div className="flex items-end gap-x-3 gap-y-2 flex-wrap">
          <Field label="State" grow>
            <select value={state} onChange={e => handleStateChange(e.target.value)}
              className="field-input w-full">
              {STATES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </Field>

          <Field label="Marital Status">
            <select value={nAdults} onChange={e => setNAdults(Number(e.target.value))}
              className="field-input w-full min-w-[6rem]">
              <option value={1}>Single</option>
              <option value={2}>Married</option>
            </select>
          </Field>

          <Field label="Children">
            <select value={nChildren} onChange={e => setNChildren(Number(e.target.value))}
              className="field-input w-full min-w-[4.5rem]">
              {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>

          <Field label="Annual Income" grow>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="text" inputMode="numeric" value={fmtInt(income)}
                onChange={e => setIncome(parseInput(e.target.value))}
                className="field-input field-input-dollar w-full" />
            </div>
          </Field>

          <Field label="Heating" grow>
            <select value={heatingSource} onChange={e => setHeatingSource(e.target.value)}
              className="field-input w-full">
              {(HEATING_SOURCES[state] || []).map(h => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </Field>

          {!isHeatInRent && (
            <Field label="Expense/yr" grow>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="text" inputMode="numeric" value={fmtInt(heatingExpense)}
                  onChange={e => setHeatingExpense(parseInput(e.target.value))}
                  className="field-input field-input-dollar w-full" />
              </div>
            </Field>
          )}

          {state === 'DC' && (
            <Field label="Housing" grow>
              <select value={dcHousingType} onChange={e => setDcHousingType(e.target.value)}
                className="field-input w-full">
                <option value="SINGLE_FAMILY">Single Family</option>
                <option value="MULTI_FAMILY">Multi Family</option>
              </select>
            </Field>
          )}

          {(isHeatInRent || state === 'IL') && (
            <Field label="Rent/yr" grow>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="text" inputMode="numeric" value={fmtInt(rent)}
                  onChange={e => setRent(parseInput(e.target.value))}
                  className="field-input field-input-dollar w-full" />
              </div>
            </Field>
          )}

          {state === 'MA' && (
            <>
              <Field label="Subsidized">
                <label className="flex items-center h-[38px]">
                  <input type="checkbox" checked={receivesHousingAssistance}
                    onChange={e => setReceivesHousingAssistance(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                </label>
              </Field>
              <Field label="Prior yr exp" grow>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="text" inputMode="numeric"
                    value={heatingExpenseLastYear ? fmtInt(heatingExpenseLastYear) : ''}
                    placeholder="0"
                    onChange={e => setHeatingExpenseLastYear(parseInput(e.target.value))}
                    className="field-input field-input-dollar w-full" />
                </div>
              </Field>
            </>
          )}

          <button onClick={calculate}
            aria-label="Calculate LIHEAP benefit estimate"
            className="h-[38px] bg-primary-600 text-white px-6 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors whitespace-nowrap shrink-0">
            Calculate
          </button>
        </div>

        {/* Result row — local computation, updates instantly after first Calculate */}
        {hasCalculated && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            {/* Eligibility pill */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${
              localEligible
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${localEligible ? 'bg-green-500' : 'bg-gray-400'}`} />
              {localEligible ? 'Eligible' : 'Not Eligible'}
            </div>

            {/* Hero benefit amount */}
            {localEligible && (
              <div className="flex items-baseline gap-2 ml-4">
                <span className="text-3xl font-bold text-primary-700 leading-none">{fmt(localBenefit)}</span>
                <span className="text-sm text-gray-500">annual heating benefit</span>
              </div>
            )}

            {/* Coverage % */}
            {localEligible && !isHeatInRent && heatingExpense > 0 && (
              <div className="flex items-baseline gap-2 ml-4 pl-4 border-l border-gray-200">
                <span className="text-2xl font-bold text-gray-700 leading-none">
                  {Math.round(Math.min(100, (localBenefit / heatingExpense) * 100))}%
                </span>
                <span className="text-sm text-gray-500">of your heating bill</span>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">
              Heating assistance only — excludes cooling, crisis &amp; weatherization
            </p>
          </div>
        )}
      </div>

      {/* ── Charts: full width, equal split ── */}
      {!hasCalculated ? (
        <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white xl:min-h-0">
          <div className="text-center">
            <p className="text-gray-400 text-sm">Enter your household details above and click <strong>Calculate</strong></p>
            <p className="text-gray-300 text-xs mt-1">to see your estimated LIHEAP benefit and explore the benefit structure</p>
          </div>
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 flex-col gap-2">
        {/* Shared heating type legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-lg border border-gray-200 bg-white">
          <span className="text-[11px] text-gray-500 font-medium">Heating:</span>
          {(CHART_HEATING_TYPES[state] || []).map((ht) => {
            const isSelected = heatingSource === ht.value;
            return (
              <div key={ht.value} className={`flex items-center gap-1.5 text-[11px] transition-opacity ${isSelected ? 'font-semibold' : 'opacity-60'}`}>
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: isSelected ? 12 : 10,
                    height: isSelected ? 3 : 2,
                    background: ht.color,
                  }}
                />
                <span className="text-gray-700">{ht.label}</span>
              </div>
            );
          })}
        </div>

      <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Left panel: Income (2D) / Income×Expense surface (3D) */}
        <div className="flex min-h-[24rem] flex-col rounded-lg border border-gray-200 bg-white p-3 xl:min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700">
              {leftIs3d ? 'Income x Expense Surface' : 'Benefit by Income'}
              <span className="text-gray-400 font-normal">
                {leftIs3d ? '' : ` — at ${fmt(isHeatInRent ? 0 : heatingExpense)}/yr expense`}
              </span>
            </p>
            <button
              onClick={() => setLeftIs3d(!leftIs3d)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                leftIs3d
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
            >
              {leftIs3d ? '2D' : '3D'}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {liheapData ? (
              leftIs3d ? (
                <Surface3DChart
                  state={state}
                  heatingType={heatingSource}
                  householdSize={householdSize}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  data={liheapData}
                />
              ) : (
                <IncomeLineChart
                  state={state}
                  householdSize={householdSize}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  chartExpense={isHeatInRent ? 99999 : heatingExpense}
                  data={liheapData}
                  highlightIncome={localEligible ? income : undefined}
                  highlightHeatingType={localEligible ? heatingSource : undefined}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-400">Loading...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Benefit by Household Size (2D) / Income×Size surface (3D) */}
        <div className="flex min-h-[24rem] flex-col rounded-lg border border-gray-200 bg-white p-3 xl:min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700">
              {rightIs3d ? 'Income x Household Size Surface' : 'Benefit by Household Size'}
              <span className="text-gray-400 font-normal">
                {rightIs3d ? '' : ` — at ${fmt(income)}/yr income`}
              </span>
            </p>
            <button
              onClick={() => setRightIs3d(!rightIs3d)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                rightIs3d
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
            >
              {rightIs3d ? '2D' : '3D'}
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {liheapData ? (
              rightIs3d ? (
                <SizeIncome3DChart
                  state={state}
                  heatingType={heatingSource}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  heatingExpense={isHeatInRent ? 99999 : heatingExpense}
                  data={liheapData}
                />
              ) : (
                <SizeLineChart
                  state={state}
                  income={income}
                  heatingExpense={isHeatInRent ? 99999 : heatingExpense}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  data={liheapData}
                  highlightSize={localEligible ? householdSize : undefined}
                  highlightHeatingType={localEligible ? heatingSource : undefined}
                />
              )
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-400">Loading...</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      )}
    </section>
  );
}

function Field({ label, children, grow, htmlFor }: { label: string; children: React.ReactNode; grow?: boolean; htmlFor?: string }) {
  return (
    <div className={grow ? 'flex-1 min-w-0' : ''}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
