'use client';

import { useState } from 'react';
import { Surface3DChart, SizeIncome3DChart, IncomeLineChart, ExpenseLineChart } from './BenefitCharts';
import type { LiheapData } from '@/lib/liheapData';
import { FALLBACK_LIHEAP_DATA, computeBenefit, isEligible } from '@/lib/liheapData';

const API_URL = process.env.NEXT_PUBLIC_POLICYENGINE_API_URL || 'https://api.policyengine.org';

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

const OUTPUT_VARS: Record<string, {
  eligible: string;
  payment: string;
  extras: { label: string; var: string; format?: 'enum' | 'int' | 'dollar' }[];
}> = {
  DC: {
    eligible: 'dc_liheap_eligible',
    payment: 'dc_liheap_payment',
    extras: [
      { label: 'Income Level', var: 'dc_liheap_income_level', format: 'int' },
    ],
  },
  MA: {
    eligible: 'ma_liheap_eligible',
    payment: 'ma_liheap',
    extras: [
      { label: 'Benefit Level', var: 'ma_liheap_benefit_level', format: 'int' },
      { label: 'Standard Payment', var: 'ma_liheap_standard_payment', format: 'dollar' },
      { label: 'HECS', var: 'ma_liheap_hecs_payment', format: 'dollar' },
    ],
  },
  IL: {
    eligible: 'il_liheap_eligible',
    payment: 'il_liheap',
    extras: [
      { label: 'Income Bracket', var: 'il_liheap_income_bracket', format: 'int' },
      { label: 'Base Payment', var: 'il_liheap_base_payment', format: 'dollar' },
    ],
  },
};

function buildHousehold(
  state: string, nAdults: number, nChildren: number, income: number,
  heatingSource: string, heatingExpense: number, rent: number,
  dcHousingType: string, receivesHousingAssistance: boolean, heatingExpenseLastYear: number,
) {
  const year = 2024;
  const people: Record<string, Record<string, Record<number, number | boolean | null>>> = {};
  const members: string[] = [];

  for (let i = 0; i < nAdults; i++) {
    const pid = `adult_${i + 1}`;
    people[pid] = {
      age: { [year]: 35 + i * 5 },
      employment_income: { [year]: i === 0 ? income : 0 },
    };
    if (i === 0 && rent > 0) people[pid].rent = { [year]: rent };
    members.push(pid);
  }

  for (let i = 0; i < nChildren; i++) {
    const pid = `child_${i + 1}`;
    people[pid] = { age: { [year]: 5 + i * 3 } };
    members.push(pid);
  }

  const spmInputs: Record<string, Record<number, any>> = {};
  const isHeatInRent = heatingSource === 'HEAT_IN_RENT' || heatingSource === 'CASH';

  if (state === 'DC') {
    spmInputs['dc_liheap_heating_type'] = { [year]: heatingSource };
    spmInputs['dc_liheap_housing_type'] = { [year]: dcHousingType };
  } else if (state === 'MA') {
    spmInputs['ma_liheap_heating_type'] = { [year]: isHeatInRent ? 'ELECTRICITY' : heatingSource };
  } else if (state === 'IL') {
    spmInputs['il_liheap_heating_type'] = { [year]: heatingSource };
  }

  if (isHeatInRent) spmInputs['heat_expense_included_in_rent'] = { [year]: true };
  if (!isHeatInRent && heatingExpense > 0) {
    people['adult_1'].heating_expense_person = { [year]: heatingExpense };
  }
  if (receivesHousingAssistance) spmInputs['receives_housing_assistance'] = { [year]: true };
  if (heatingExpenseLastYear > 0) spmInputs['heating_expense_last_year'] = { [year]: heatingExpenseLastYear };

  const vars = OUTPUT_VARS[state];
  for (const v of [vars.eligible, vars.payment, ...vars.extras.map(e => e.var)]) {
    spmInputs[v] = { [year]: null };
  }

  return {
    people,
    spm_units: { spm_unit: { members, ...spmInputs } },
    tax_units: { tax_unit: { members } },
    families: { family: { members } },
    marital_units: nAdults >= 2
      ? { marital_unit: { members: ['adult_1', 'adult_2'] } }
      : { marital_unit: { members: ['adult_1'] } },
    households: { household: { members, state_code: { [year]: state } } },
  };
}

interface Result {
  eligible: boolean;
  payment: number;
  extras: { label: string; value: string }[];
}

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

  const [result, setResult] = useState<Result | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liheapData] = useState<LiheapData>(FALLBACK_LIHEAP_DATA);
  const [hasCalculated, setHasCalculated] = useState(false);
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
    setResult(null);

  }

  async function calculate() {
    setHasCalculated(true);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const household = buildHousehold(
        state, nAdults, nChildren, income,
        heatingSource, heatingExpense, rent,
        dcHousingType, receivesHousingAssistance, heatingExpenseLastYear,
      );
      const res = await fetch(`${API_URL}/us/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.message || 'Calculation failed');

      const spm = data.result?.spm_units?.spm_unit;
      const vars = OUTPUT_VARS[state];
      const eligible = spm?.[vars.eligible]?.['2024'] ?? false;
      const payment = spm?.[vars.payment]?.['2024'] ?? 0;
      const extras = vars.extras.map(e => {
        const raw = spm?.[e.var]?.['2024'] ?? 0;
        let value: string;
        if (e.format === 'dollar') value = `$${Number(raw).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        else if (e.format === 'int') value = String(Math.round(Number(raw)));
        else value = String(raw);
        return { label: e.label, value };
      });
      setResult({ eligible: Boolean(eligible), payment: Number(payment), extras });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');

    } finally {
      setLoading(false);
    }
  }

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

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

          <Field label="Adults">
            <select value={nAdults} onChange={e => setNAdults(Number(e.target.value))}
              className="field-input w-full min-w-[4.5rem]">
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
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
              <input type="number" value={income} onChange={e => setIncome(Number(e.target.value))}
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
                <input type="number" value={heatingExpense}
                  onChange={e => setHeatingExpense(Number(e.target.value))}
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
                <input type="number" value={rent} onChange={e => setRent(Number(e.target.value))}
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
                  <input type="number" value={heatingExpenseLastYear || ''} placeholder="0"
                    onChange={e => setHeatingExpenseLastYear(Number(e.target.value))}
                    className="field-input field-input-dollar w-full" />
                </div>
              </Field>
            </>
          )}

          <button onClick={calculate} disabled={loading}
            className="h-[38px] bg-primary-600 text-white px-6 rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0">
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </div>

        {/* Result row — local computation, updates instantly after first Calculate */}
        {hasCalculated && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${localEligible ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className={`text-base font-semibold ${localEligible ? 'text-green-800' : 'text-gray-600'}`}>
                {localEligible ? 'Eligible' : 'Not Eligible'}
              </span>
              {localEligible && (
                <span className="text-2xl font-bold text-primary-700 ml-2">{fmt(localBenefit)}<span className="text-sm font-normal text-gray-400">/yr</span></span>
              )}
            </div>
            {result && result.eligible && result.extras.length > 0 && (
              <>
                <div className="h-5 w-px bg-gray-200" />
                {result.extras.map((e, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm">
                    <span className="text-gray-500">{e.label}</span>
                    <span className="font-medium text-gray-800">{e.value}</span>
                  </div>
                ))}
              </>
            )}
            {error && <p className="text-sm text-red-600 ml-2">{error}</p>}
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

        {/* Right panel: Expense (2D) / Income×Size surface (3D) */}
        <div className="flex min-h-[24rem] flex-col rounded-lg border border-gray-200 bg-white p-3 xl:min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-700">
              {rightIs3d ? 'Income x Household Size Surface' : 'Benefit by Heating Expense'}
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
                <ExpenseLineChart
                  state={state}
                  householdSize={householdSize}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  chartIncome={income}
                  data={liheapData}
                  highlightExpense={localEligible ? (isHeatInRent ? undefined : heatingExpense) : undefined}
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
      )}
    </section>
  );
}

function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={grow ? 'flex-1 min-w-0' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
