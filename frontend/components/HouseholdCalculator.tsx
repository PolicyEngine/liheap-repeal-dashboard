'use client';

import { useState } from 'react';
import { Surface3DChart, IncomeLineChart } from './BenefitCharts';

const API_URL = 'https://api.policyengine.org';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const [chartExpense, setChartExpense] = useState(3000);

  const [result, setResult] = useState<Result | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHeatInRent = heatingSource === 'HEAT_IN_RENT' || heatingSource === 'CASH';
  const householdSize = nAdults + nChildren;

  function handleStateChange(newState: string) {
    setState(newState);
    setHeatingSource(HEATING_SOURCES[newState][0].value);
    setResult(null);
    setHasCalculated(false);
  }

  async function calculate() {
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
      setHasCalculated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHasCalculated(true);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  return (
    <section id="calculator" className="flex flex-col" style={{ height: 'calc(100vh - 10.5rem)' }}>
      {/* ── Form bar ── */}
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-end gap-x-3 gap-y-3">
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

          <Field label="Expense/yr" grow>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isHeatInRent ? 'text-gray-300' : 'text-gray-400'}`}>$</span>
              <input type="number" value={isHeatInRent ? '' : heatingExpense}
                onChange={e => setHeatingExpense(Number(e.target.value))}
                disabled={isHeatInRent} placeholder={isHeatInRent ? 'N/A' : ''}
                className={`field-input field-input-dollar w-full ${isHeatInRent ? 'bg-gray-100 text-gray-400' : ''}`} />
            </div>
          </Field>

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
      </div>

      {/* ── Main dashboard area ── */}
      {!hasCalculated && !loading ? (
        <div className="flex-1 flex items-center justify-center mt-3 rounded-lg border-2 border-dashed border-gray-200 bg-white">
          <div className="text-center">
            <p className="text-gray-400 text-sm">Enter your household details above and click <strong>Calculate</strong></p>
            <p className="text-gray-300 text-xs mt-1">to see your estimated LIHEAP benefit and explore the benefit structure</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 mt-3 min-h-0">
          {/* Left: 3D Surface Chart */}
          <div className="lg:col-span-3 rounded-lg border border-gray-200 bg-white p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-700">Benefit Landscape</h4>
              <p className="text-[10px] text-gray-400">Drag to rotate, scroll to zoom</p>
            </div>
            <div className="flex-1 min-h-0">
              <Surface3DChart
                state={state}
                heatingType={heatingSource}
                householdSize={householdSize}
                housingType={dcHousingType}
                subsidized={receivesHousingAssistance}
              />
            </div>
          </div>

          {/* Right: Result + Line Chart */}
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
            {/* Result card */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-2 mb-2">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              {result ? (
                <>
                  <div className={`flex items-center gap-2 ${result.eligible ? '' : 'opacity-60'}`}>
                    <span className={`w-3 h-3 rounded-full ${result.eligible ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className={`text-base font-semibold ${result.eligible ? 'text-green-800' : 'text-gray-600'}`}>
                      {result.eligible ? 'Eligible' : 'Not Eligible'}
                    </span>
                    {result.eligible && (
                      <span className="ml-auto text-2xl font-bold text-primary-700">
                        {fmt(result.payment)}
                      </span>
                    )}
                  </div>
                  {result.eligible && result.extras.length > 0 && (
                    <dl className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                      {result.extras.map((e, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <dt className="text-gray-500">{e.label}</dt>
                          <dd className="font-medium text-gray-800">{e.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="text-[10px] text-gray-400 mt-3">
                    Estimate via <a href="https://policyengine.org" target="_blank" rel="noopener noreferrer"
                      className="underline hover:text-gray-600">PolicyEngine API</a>. Actual benefits may vary.
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-center py-3">
                  <p className="text-sm text-gray-400">
                    {loading ? 'Calculating...' : 'Click Calculate to estimate your benefit'}
                  </p>
                </div>
              )}
            </div>

            {/* Line chart */}
            <div className="flex-1 rounded-lg border border-gray-200 bg-white p-3 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-gray-700">Benefit by Income</h4>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-gray-400">Expense:</label>
                  <select value={chartExpense} onChange={e => setChartExpense(Number(e.target.value))}
                    className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500">
                    {[500, 1000, 1500, 2000, 3000, 5000].map(v => (
                      <option key={v} value={v}>{fmt(v)}/yr</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <IncomeLineChart
                  state={state}
                  householdSize={householdSize}
                  housingType={dcHousingType}
                  subsidized={receivesHousingAssistance}
                  chartExpense={chartExpense}
                />
              </div>
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
