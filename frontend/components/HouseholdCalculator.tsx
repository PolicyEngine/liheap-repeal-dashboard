'use client';

import { useState } from 'react';

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
    { label: 'Natural Gas', value: 'NAT_GAS' },
    { label: 'Propane / Fuel Oil', value: 'PROPANE_FUEL_OIL' },
    { label: 'Heat included in rent', value: 'CASH' },
  ],
};

// Map heating source to the correct expense variable for the API
function getExpenseVar(state: string, heatingSource: string): string | null {
  if (heatingSource === 'HEAT_IN_RENT' || heatingSource === 'CASH') return null;
  const map: Record<string, Record<string, string>> = {
    DC: {
      ELECTRICITY: 'pre_subsidy_electricity_expense',
      GAS: 'gas_expense',
      OIL: 'fuel_oil_expense',
    },
    MA: {
      ELECTRICITY: 'electricity_expense',
      NATURAL_GAS: 'gas_expense',
      HEATING_OIL_AND_PROPANE: 'fuel_oil_expense',
      KEROSENE: 'fuel_oil_expense',
      OTHER: 'heating_cooling_expense',
    },
    IL: {
      ALL_ELECTRIC: 'electricity_expense',
      NAT_GAS: 'gas_expense',
      PROPANE_FUEL_OIL: 'fuel_oil_expense',
    },
  };
  return map[state]?.[heatingSource] ?? null;
}

// State-specific output variable names
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
      { label: 'HECS (High Energy Cost Supplement)', var: 'ma_liheap_hecs_payment', format: 'dollar' },
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
  state: string,
  nAdults: number,
  nChildren: number,
  income: number,
  heatingSource: string,
  heatingExpense: number,
  rent: number,
  dcHousingType: string,
  receivesHousingAssistance: boolean,
  heatingExpenseLastYear: number,
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
    if (i === 0 && rent > 0) {
      people[pid].rent = { [year]: rent };
    }
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
  }

  if (isHeatInRent) {
    spmInputs['heat_expense_included_in_rent'] = { [year]: true };
  }

  const expenseVar = getExpenseVar(state, heatingSource);
  if (expenseVar && heatingExpense > 0) {
    spmInputs[expenseVar] = { [year]: heatingExpense };
  }

  if (receivesHousingAssistance) {
    spmInputs['receives_housing_assistance'] = { [year]: true };
  }

  if (heatingExpenseLastYear > 0) {
    spmInputs['heating_expense_last_year'] = { [year]: heatingExpenseLastYear };
  }

  // Add output variables as null to request computation
  const vars = OUTPUT_VARS[state];
  const outputVarNames = [vars.eligible, vars.payment, ...vars.extras.map(e => e.var)];
  for (const v of outputVarNames) {
    spmInputs[v] = { [year]: null };
  }

  const maritalUnits: Record<string, { members: string[] }> =
    nAdults >= 2
      ? { marital_unit: { members: ['adult_1', 'adult_2'] } }
      : { marital_unit: { members: ['adult_1'] } };

  return {
    people,
    spm_units: { spm_unit: { members, ...spmInputs } },
    tax_units: { tax_unit: { members } },
    families: { family: { members } },
    marital_units: maritalUnits,
    households: {
      household: {
        members,
        state_code: { [year]: state },
      },
    },
  };
}

interface Result {
  eligible: boolean;
  payment: number;
  extras: { label: string; value: string }[];
}

export default function HouseholdCalculator() {
  const [open, setOpen] = useState(false);
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
  const [showMethodology, setShowMethodology] = useState(false);

  const isHeatInRent =
    heatingSource === 'HEAT_IN_RENT' || heatingSource === 'CASH';

  function handleStateChange(newState: string) {
    setState(newState);
    setHeatingSource(HEATING_SOURCES[newState][0].value);
    setResult(null);
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

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      if (data.status !== 'ok') {
        throw new Error(data.message || 'Calculation failed');
      }

      // Extract results from spm_unit in the result
      const spm = data.result?.spm_units?.spm_unit;
      const vars = OUTPUT_VARS[state];

      const eligible = spm?.[vars.eligible]?.['2024'] ?? false;
      const payment = spm?.[vars.payment]?.['2024'] ?? 0;

      const extras = vars.extras.map(e => {
        const raw = spm?.[e.var]?.['2024'] ?? 0;
        let value: string;
        if (e.format === 'dollar') {
          value = `$${Number(raw).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        } else if (e.format === 'int') {
          value = String(Math.round(Number(raw)));
        } else {
          value = String(raw);
        }
        return { label: e.label, value };
      });

      setResult({ eligible: Boolean(eligible), payment: Number(payment), extras });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="calculator">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left px-6 py-5 rounded-lg border-2 border-primary-200 bg-primary-50 hover:bg-primary-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-200 text-primary-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm2.25-6.75h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zM3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v2.776c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-2.776a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary-800">
              Household LIHEAP Calculator
            </h2>
            <p className="text-sm text-primary-600 mt-0.5">
              {open ? 'Enter your household details below' : 'Click to estimate your LIHEAP eligibility and benefit'}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-primary-500 shrink-0 ml-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Input form */}
            <div className="space-y-5">
              {/* State */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select
                  value={state}
                  onChange={e => handleStateChange(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  {STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Household size */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
                  <select
                    value={nAdults}
                    onChange={e => setNAdults(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {[1, 2, 3, 4].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
                  <select
                    value={nChildren}
                    onChange={e => setNChildren(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Income */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Annual Household Income
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    value={income}
                    onChange={e => setIncome(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Heating source */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heating Source</label>
                <select
                  value={heatingSource}
                  onChange={e => setHeatingSource(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {(HEATING_SOURCES[state] || []).map(h => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>

              {/* Heating expense (disabled for heat-in-rent) */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${isHeatInRent ? 'text-gray-400' : 'text-gray-700'}`}>
                  Annual Heating Expense
                </label>
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isHeatInRent ? 'text-gray-300' : 'text-gray-500'}`}>$</span>
                  <input
                    type="number"
                    value={isHeatInRent ? '' : heatingExpense}
                    onChange={e => setHeatingExpense(Number(e.target.value))}
                    disabled={isHeatInRent}
                    placeholder={isHeatInRent ? 'Included in rent' : ''}
                    className={`w-full rounded-md border pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      isHeatInRent
                        ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'border-gray-300 bg-white'
                    }`}
                  />
                </div>
              </div>

              {/* Rent (shown for heat-in-rent or IL) */}
              {(isHeatInRent || state === 'IL') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Rent
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={rent}
                      onChange={e => setRent(Number(e.target.value))}
                      className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  {isHeatInRent && state === 'IL' && (
                    <p className="text-xs text-gray-500 mt-1">
                      IL requires rent &gt; 30% of income for heat-in-rent eligibility.
                    </p>
                  )}
                </div>
              )}

              {/* DC housing type */}
              {state === 'DC' && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Housing Type</label>
                    <div className="relative group">
                      <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <p>&quot;Multifamily usually means apartments.&quot; — <a href="https://doee.dc.gov/sites/default/files/dc/sites/doee/service_content/attachments/DOEE%20FY24%20LIHEAP_REGULAR_Benefits_Table-Matrix.pdf" target="_blank" rel="noopener noreferrer" className="underline text-primary-200">DOEE FY24 Benefits Table</a></p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                      </div>
                    </div>
                  </div>
                  <select
                    value={dcHousingType}
                    onChange={e => setDcHousingType(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="SINGLE_FAMILY">Single Family</option>
                    <option value="MULTI_FAMILY">Multi Family</option>
                  </select>
                </div>
              )}

              {/* MA subsidized housing */}
              {state === 'MA' && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="housing-assistance"
                      checked={receivesHousingAssistance}
                      onChange={e => setReceivesHousingAssistance(e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="housing-assistance" className="text-sm text-gray-700">
                      Receives housing assistance (e.g., Section 8)
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prior-Year Heating Expense
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        value={heatingExpenseLastYear || ''}
                        onChange={e => setHeatingExpenseLastYear(Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for HECS (High Energy Cost Supplement) eligibility. Enter last year&apos;s total heating cost. Leave blank or $0 if unknown.
                    </p>
                  </div>
                </>
              )}

              {/* Calculate button */}
              <button
                onClick={calculate}
                disabled={loading}
                className="w-full bg-primary-600 text-white py-2.5 px-4 rounded-md text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Calculating...' : 'Calculate LIHEAP Benefit'}
              </button>
            </div>

            {/* Results panel */}
            <div>
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {result && (
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  {/* Eligibility banner */}
                  <div className={`px-5 py-4 ${result.eligible ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${result.eligible ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <span className={`font-semibold text-lg ${result.eligible ? 'text-green-800' : 'text-gray-600'}`}>
                        {result.eligible ? 'Eligible' : 'Not Eligible'}
                      </span>
                    </div>
                    {!result.eligible && (
                      <p className="text-sm text-gray-500 mt-1">
                        This household does not meet the income or other eligibility requirements.
                      </p>
                    )}
                  </div>

                  {/* Payment amount */}
                  {result.eligible && (
                    <div className="px-5 py-5 border-t border-gray-200">
                      <p className="text-sm text-gray-500 mb-1">Estimated Annual Benefit</p>
                      <p className="text-3xl font-bold text-primary-700">
                        ${result.payment.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        One-time seasonal payment
                      </p>
                    </div>
                  )}

                  {/* Breakdown */}
                  {result.eligible && result.extras.length > 0 && (
                    <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Details</p>
                      <dl className="space-y-1">
                        {result.extras.map((e, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <dt className="text-gray-600">{e.label}</dt>
                            <dd className="font-medium text-gray-900">{e.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-400">
                      This is an estimate based on PolicyEngine&apos;s model of {STATES.find(s => s.code === state)?.label} LIHEAP.
                      Actual benefits may vary. Powered by the{' '}
                      <a href="https://policyengine.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
                        PolicyEngine API
                      </a>.
                    </p>
                  </div>
                </div>
              )}

              {!result && !error && (
                <div className="flex items-center justify-center h-full min-h-[200px] rounded-lg border-2 border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">Enter household details and click Calculate</p>
                </div>
              )}
            </div>
          </div>

          {/* Methodology */}
          <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setShowMethodology(!showMethodology)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
              <span className="text-sm font-semibold text-gray-700">Methodology</span>
              <span className="text-gray-400 text-xs">{showMethodology ? 'Hide' : 'Show details'}</span>
            </button>
            {showMethodology && (
              <div className="px-4 py-4 text-sm text-gray-700 space-y-3 border-t border-gray-200 bg-white">
                <h4 className="font-semibold text-gray-900">How this calculator works</h4>
                <p>This calculator sends your household details to the <a href="https://policyengine.org" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">PolicyEngine API</a>, which runs the full LIHEAP eligibility and payment model for the selected state.</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-600">
                  <li><strong>API:</strong> Calls <code className="bg-gray-100 px-1 rounded text-xs">api.policyengine.org/us/calculate</code> with a single-household situation. No data leaves your browser except to this API.</li>
                  <li><strong>Income concept:</strong> The amount you enter represents your <em>total household income</em> from all members combined — this matches how LIHEAP applications work in practice. The model sums <code className="bg-gray-100 px-1 rounded text-xs">irs_gross_income</code> across all SPM unit members for eligibility. The income threshold is 60% of State Median Income (DC, IL) or state-specific FPG-based limits (MA).</li>
                  <li><strong>Heating expense mapping:</strong> Your selected heating source determines which expense variable is set (e.g., Electricity → <code className="bg-gray-100 px-1 rounded text-xs">{state === 'DC' ? 'pre_subsidy_electricity_expense' : 'electricity_expense'}</code>, Gas → <code className="bg-gray-100 px-1 rounded text-xs">gas_expense</code>, Oil → <code className="bg-gray-100 px-1 rounded text-xs">fuel_oil_expense</code>). Benefits are capped at actual heating expenses (except heat-in-rent).</li>
                  <li><strong>Household size:</strong> Modeled as an SPM unit. Household size affects both income thresholds and payment amounts.</li>
                  {state === 'DC' && (
                    <li><strong>DC payment model:</strong> Uses a payment matrix by heating type (electricity, gas, oil, heat-in-rent), housing type (single/multi-family), income level (10 levels at $2,000 increments), and household size (capped at 4). Source: <a href="https://doee.dc.gov/sites/default/files/dc/sites/doee/service_content/attachments/DOEE%20FY24%20LIHEAP_REGULAR_Benefits_Table-Matrix.pdf" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">DOEE FY24 Benefits Table</a>.</li>
                  )}
                  {state === 'MA' && (
                    <>
                      <li><strong>MA payment model:</strong> Uses 6 benefit levels based on income as % of Federal Poverty Guidelines, with separate payment tables for utility vs. deliverable fuel and subsidized vs. non-subsidized housing. Source: <a href="https://www.mass.gov/doc/fy-2025-heap-income-eligibility-benefit-chart-may-8-2025/download" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">FY2025 HEAP Benefit Chart</a>.</li>
                      <li><strong>HECS:</strong> The High Energy Cost Supplement is an additional payment for households whose prior-year heating costs exceed a threshold. Set &quot;heating expense last year&quot; if applicable (not yet exposed in the form — uses default of $0).</li>
                    </>
                  )}
                  {state === 'IL' && (
                    <li><strong>IL payment model:</strong> Uses a 96-cell benefit matrix: 4 income brackets (0-50%, 51-100%, 101-150%, 151-200% FPL) x 4 fuel types x 6 household sizes. Fuel type is inferred from which expense variable has a value. Source: <a href="https://liheapch.acf.gov/docs/2024/benefits-matricies/IL_BenefitMatrix_2024.pdf#page=1" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">IL LIHEAP FY2024 Benefit Matrix</a>.</li>
                  )}
                  <li><strong>API version:</strong> Results depend on the version of <code className="bg-gray-100 px-1 rounded text-xs">policyengine-us</code> deployed to the API. Currently v1.633.1. IL benefit matrix (PR #7963) and MA expense cap fix are pending release.</li>
                  <li><strong>Limitations:</strong> This is an estimate. Actual LIHEAP benefits may differ due to: additional eligibility factors not modeled (utility account verification, citizenship documentation), state-specific income definitions, administrative discretion, and funding availability.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
