'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

const COLORS = {
  gainMore5: '#285E61', gainLess5: '#31979599', noChange: '#E2E8F0',
  loseLess5: '#9CA3AF', loseMore5: '#4B5563', positive: '#319795', negative: '#4B5563',
};
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };
const TICK_STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 12 };

const STATE_LABELS: Record<string, string> = { DC: 'Washington DC', MA: 'Massachusetts', IL: 'Illinois' };

const STATE_PROFILE_URLS: Record<string, string> = {
  DC: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_DistrictofColumbia_Profile.pdf',
  MA: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_Massachusetts_Profile.pdf',
  IL: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_Illinois_Profile.pdf',
};

interface BaselineStats {
  year: number;
  recipients: number;
  total_spending: number;
  avg_benefit: number;
  eligible?: number;
}

interface AnalysisData {
  budget: { budgetary_impact: number; households: number };
  decile: { average: Record<string, number>; relative: Record<string, number> };
  intra_decile: { all: Record<string, number>; deciles: Record<string, number[]> };
  total_cost: number;
  affected_households: number;
  avg_loss: number;
  winners: number;
  losers: number;
  winners_rate: number;
  losers_rate: number;
  poverty: {
    poverty: { all: { baseline: number; reform: number }; child: { baseline: number; reform: number } };
    deep_poverty: { all: { baseline: number; reform: number }; child: { baseline: number; reform: number } };
  };
  by_income_bracket: { bracket: string; affected: number; total_loss: number; avg_loss: number }[];
  baseline_stats: BaselineStats;
  repeal_stats: BaselineStats;
  variable?: string;
  takeup_rate?: number;
}

interface AnalysisDataWithMeta extends AnalysisData {
  description?: string;
  assumptions?: string;
}

interface StateData {
  survey: AnalysisData;
  model: AnalysisDataWithMeta | null;
  model_imputed_raw: AnalysisDataWithMeta | null;
  model_imputed_derived: AnalysisDataWithMeta | null;
  baseline_year: number;
  repeal_year: number;
  validation: {
    actual_heating_hh: number;
    actual_heating_spending: number;
    actual_avg_benefit: number;
    actual_total_hh: number;
    actual_direct_assistance: number;
  };
}

interface AllData {
  meta: { baseline_year: number; repeal_year: number; states: string[] };
  states: Record<string, StateData>;
}

function CustomTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '8px 12px', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
      {label && <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1A202C' }}>{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color || '#4A5568' }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

function UnderlineTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-primary-600 text-primary-700'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >{label}</button>
  );
}

export default function AggregateImpact() {
  const [allData, setAllData] = useState<AllData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState('DC');
  const [dataSource, setDataSource] = useState<'survey' | 'model' | 'model_imputed_raw' | 'model_imputed_derived'>('survey');
  const [activeSection, setActiveSection] = useState<'fiscal' | 'distributional' | 'winners' | 'poverty'>('fiscal');
  const [distMode, setDistMode] = useState<'relative' | 'absolute'>('relative');
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const res = await fetch(`${basePath}/data/aggregate_impact.json`);
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        setAllData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
        <p className="mt-4 text-gray-600">Loading impact data...</p>
      </div>
    </div>
  );

  if (error || !allData) return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
      <h3 className="text-gray-800 font-semibold mb-2">Impact data not available</h3>
      <p className="text-gray-600">{error}</p>
      <p className="text-sm text-gray-500 mt-4">Run: <code>python scripts/generate_liheap_impacts.py</code></p>
    </div>
  );

  const stateData = allData.states[selectedState];
  if (!stateData) return null;

  const dataSources: { key: typeof dataSource; label: string; data: AnalysisData | null; shortLabel: string }[] = [
    { key: 'survey', label: 'CPS survey reported', data: stateData.survey, shortLabel: 'CPS Survey' },
    { key: 'model', label: 'Model: HF + ACS proxy', data: stateData.model, shortLabel: 'HF + ACS Proxy' },
    { key: 'model_imputed_raw', label: 'Model: Imputed (raw)', data: stateData.model_imputed_raw, shortLabel: 'Imputed Raw' },
    { key: 'model_imputed_derived', label: 'Model: Imputed + derived', data: stateData.model_imputed_derived, shortLabel: 'Imputed + Derived' },
  ];
  const availableSources = dataSources.filter(s => s.data !== null);

  // Fall back to survey if selected source is unavailable
  const currentSource = availableSources.find(s => s.key === dataSource) || availableSources[0];
  const data: AnalysisData = currentSource.data!;
  const v = stateData.validation;
  const baselineYear = stateData.baseline_year;
  const repealYear = stateData.repeal_year;

  // For CPS survey, compare against total unduplicated; for model approaches, compare against heating-only
  const isModel = dataSource !== 'survey';
  const actualHH = isModel ? v.actual_heating_hh : v.actual_total_hh;
  const actualSpending = isModel ? v.actual_heating_spending : v.actual_direct_assistance;
  const actualAvg = isModel ? v.actual_avg_benefit : Math.round(v.actual_direct_assistance / v.actual_total_hh);
  const modelMeta = isModel ? (data as AnalysisDataWithMeta) : null;

  const formatCurrencyWithSign = (value: number) => {
    const formatted = `$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };
  const formatBillions = (value: number) => {
    const abs = Math.abs(value);
    const sign = value >= 0 ? '+' : '-';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return formatCurrencyWithSign(value);
  };

  const bs = data.baseline_stats;
  const rs = data.repeal_stats;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Impact of LIHEAP repeal</h2>

      {/* Level 1: State selector — pill style */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(allData.states).map((st) => (
          <button key={st} onClick={() => setSelectedState(st)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              selectedState === st
                ? 'bg-primary-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >{STATE_LABELS[st] || st}</button>
        ))}
      </div>

      {/* Level 2: Data source — underline tabs */}
      <div className="border-b border-gray-200 flex flex-wrap">
        {availableSources.map((s) => (
          <UnderlineTab key={s.key} label={s.label}
            active={dataSource === s.key}
            onClick={() => setDataSource(s.key)} />
        ))}
      </div>

      {/* Methodology section */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setShowMethodology(!showMethodology)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
          <span className="text-sm font-semibold text-gray-700">Methodology</span>
          <span className="text-gray-400 text-xs">{showMethodology ? 'Hide' : 'Show details'}</span>
        </button>
        {showMethodology && (
          <div className="px-4 py-4 text-sm text-gray-700 space-y-3 border-t border-gray-200 bg-white">
            {dataSource === 'survey' && (
              <>
                <h4 className="font-semibold text-gray-900">CPS Survey Reported</h4>
                <p>Uses the <code className="bg-gray-100 px-1 rounded text-xs">spm_unit_energy_subsidy_reported</code> variable from the Current Population Survey (CPS) Annual Social and Economic Supplement (ASEC).</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-600">
                  <li><strong>Data source:</strong> CPS ASEC microdata, processed by PolicyEngine into state-level .h5 files hosted on HuggingFace.</li>
                  <li><strong>What it captures:</strong> Self-reported energy assistance received by each SPM unit. This includes <em>all</em> energy assistance types (heating, cooling, crisis) — not just LIHEAP heating.</li>
                  <li><strong>Weighting:</strong> Survey weights from CPS, calibrated by PolicyEngine to match state-level demographic targets.</li>
                  <li><strong>Baseline ({baselineYear}):</strong> Energy subsidy values as reported in the CPS. LIHEAP is active.</li>
                  <li><strong>Repeal ({repealYear}):</strong> Energy subsidy set to $0 for all SPM units. Poverty and distributional impacts are computed from the difference.</li>
                  <li><strong>Strengths:</strong> Captures actual program participation patterns; flows through the full poverty calculation chain (SPM thresholds, net income).</li>
                  <li><strong>Limitations:</strong> CPS respondents systematically underreport program participation (e.g., MA shows 67% of actual recipients). No state LIHEAP formula used — purely survey-based.</li>
                  <li><strong>Validation:</strong> Compared against total direct assistance (heating + cooling + crisis) from <a href={STATE_PROFILE_URLS[selectedState]} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">ACF FY2024 State Profile</a>.</li>
                </ul>
              </>
            )}
            {dataSource === 'model' && (
              <>
                <h4 className="font-semibold text-gray-900">Model: HuggingFace Dataset + ACS Proxy Injection</h4>
                <p>Computes LIHEAP heating benefits using PolicyEngine&apos;s state LIHEAP payment model (<code className="bg-gray-100 px-1 rounded text-xs">{data.variable}</code>), with ACS-derived household characteristics injected at runtime.</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-600">
                  <li><strong>Data source:</strong> Standard state .h5 dataset from HuggingFace (<code className="text-xs">hf://policyengine/policyengine-us-data/states/{selectedState}.h5</code>). This is CPS-based and does <em>not</em> contain heating expense or heating fuel data.</li>
                  <li><strong>ACS proxy injection:</strong> Before computing payments, the script injects ACS 2023 1-Year statistics via <code className="text-xs">sim.set_input()</code>:
                    <ul className="list-disc ml-5 mt-1 space-y-1">
                      <li><strong>Heating expense:</strong> <code className="text-xs">heating_expense_person</code> — annual heating cost per person, derived from ACS PUMS utility cost data.</li>
                      <li><strong>Heat-in-rent rate:</strong> From ACS PUMS — percentage of renters whose primary heating fuel cost is included in rent (GASFP/ELEFP=1). Randomly assigned to renters using a fixed seed.</li>
                      <li><strong>Heating fuel type:</strong> From ACS Table B25117 (Tenure by House Heating Fuel). Distribution of gas, electric, propane, oil by renter/owner status.</li>
                      {selectedState === 'DC' && <li><strong>Housing type:</strong> From ACS Table B25032 (Tenure by Units in Structure). Single-family vs multi-family by renter/owner status.</li>}
                    </ul>
                  </li>
                  <li><strong>Takeup rate:</strong> {((data.takeup_rate || 0) * 100).toFixed(1)}% — computed as FY2024 heating households served / state income-eligible population from the ACF State Profile.</li>
                  <li><strong>Payment model:</strong> State-specific LIHEAP formula. {selectedState === 'DC' ? 'DC uses a payment matrix by heating type, housing type, income level (10 levels at $2,000 increments), and household size (1-4).' : selectedState === 'IL' ? 'IL uses a 96-cell benefit matrix: 4 income brackets (% FPL) x 4 fuel types x 6 household sizes. Source: IL LIHEAP FY2024 Benefit Matrix.' : 'MA uses a formula based on household size and income.'}</li>
                  <li><strong>Strengths:</strong> Uses state-specific LIHEAP rules and payment schedules; ACS provides accurate fuel/housing distributions; best total spending match for DC (99.95%).</li>
                  <li><strong>Limitations:</strong> ACS proxies are random assignments at the population level (not household-specific); eligible population count may differ from ACF estimates due to income concept differences.</li>
                </ul>
              </>
            )}
            {dataSource === 'model_imputed_raw' && (
              <>
                <h4 className="font-semibold text-gray-900">Model: Imputed Dataset (Raw)</h4>
                <p>Uses a custom state .h5 dataset where heating expense and heat-in-rent status have been imputed from ACS PUMS onto the CPS microdata. No additional injection at runtime.</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-600">
                  <li><strong>Data source:</strong> <code className="text-xs">{selectedState}_with_utilities.h5</code> — built in policyengine-us-data by imputing ACS PUMS utility variables onto CPS households using statistical matching (income, household size, tenure, state).</li>
                  <li><strong>Imputed variables:</strong>
                    <ul className="list-disc ml-5 mt-1 space-y-1">
                      <li><code className="text-xs">heating_expense_person</code> — annual heating cost per person, derived from ACS PUMS utility cost data</li>
                      <li><code className="text-xs">heat_expense_included_in_rent</code> — boolean, derived from ACS PUMS fuel cost flags (ELEFP=1 or GASFP=1 means included in rent)</li>
                    </ul>
                  </li>
                  <li><strong>No fuel type injection:</strong> The state LIHEAP heating type variable (e.g., gas vs electric) is NOT set — it defaults to the model&apos;s default value. This typically underestimates payments because the default fuel type may have lower benefit amounts.</li>
                  <li><strong>Takeup rate:</strong> Same {((data.takeup_rate || 0) * 100).toFixed(1)}% as other model approaches.</li>
                  <li><strong>Strengths:</strong> Heating expense is household-specific (not random population-level assignment); heat-in-rent is based on actual imputed data.</li>
                  <li><strong>Limitations:</strong> Imputation may not perfectly reproduce state-level utility distributions; missing fuel type assignment leads to lower average benefits; imputed heat-in-rent rate may differ from PUMS-computed rate.</li>
                </ul>
              </>
            )}
            {dataSource === 'model_imputed_derived' && (
              <>
                <h4 className="font-semibold text-gray-900">Model: Imputed Dataset + Derived Fuel Type</h4>
                <p>Same imputed dataset as above, but heating type is also derived and injected at the household level using ACS PUMS heating fuel data.</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-600">
                  <li><strong>Data source:</strong> Same <code className="text-xs">{selectedState}_with_utilities.h5</code> imputed dataset.</li>
                  <li><strong>Heating type derivation:</strong> For each household, the state heating type enum is set based on ACS PUMS primary heating fuel:
                    <ul className="list-disc ml-5 mt-1 space-y-1">
                      <li>If <code className="text-xs">heat_expense_included_in_rent = true</code> → {selectedState === 'IL' ? 'Cash (heat in rent)' : 'Heat in Rent'}</li>
                      <li>ACS primary heating fuel = utility gas → {selectedState === 'IL' ? 'Natural Gas / Other' : 'Gas'}</li>
                      <li>ACS primary heating fuel = electricity → {selectedState === 'IL' ? 'All Electric' : 'Electricity'}</li>
                      <li>ACS primary heating fuel = fuel oil/propane → {selectedState === 'IL' ? 'Propane / Fuel Oil' : selectedState === 'DC' ? 'Oil' : 'Heating Oil / Propane'}</li>
                    </ul>
                  </li>
                  {selectedState === 'DC' && <li><strong>Housing type:</strong> Still uses ACS B25032 proxy injection (not available in imputed dataset).</li>}
                  <li><strong>Takeup rate:</strong> Same {((data.takeup_rate || 0) * 100).toFixed(1)}% as other model approaches.</li>
                  <li><strong>Strengths:</strong> Both heating expense and heating type are household-specific based on imputed ACS data (not random population-level assignment).</li>
                  <li><strong>Limitations:</strong> ACS primary heating fuel may not perfectly match what households report to LIHEAP; imputed expense distributions may differ from ACS published tables.</li>
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Level 3: Analysis tabs — underline tabs */}
      <div className="border-b border-gray-200 flex">
        {[
          { key: 'fiscal' as const, label: 'Budgetary impact' },
          { key: 'distributional' as const, label: 'Distributional impact' },
          { key: 'winners' as const, label: 'Winners & losers' },
          { key: 'poverty' as const, label: 'Poverty impact' },
        ].map((s) => (
          <UnderlineTab key={s.key} label={s.label} active={activeSection === s.key} onClick={() => setActiveSection(s.key)} />
        ))}
      </div>

      {/* ===== FISCAL ===== */}
      {activeSection === 'fiscal' && (
        <div className="space-y-8">
          {/* Baseline */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">{baselineYear} — LIHEAP active</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-5 border bg-green-50 border-green-200">
                <p className="text-sm text-gray-600 mb-1">Total spending</p>
                <p className="text-3xl font-bold text-green-700">${(bs.total_spending / 1e6).toFixed(1)}M</p>
                <p className="text-xs text-gray-400 mt-2">${(actualSpending / 1e6).toFixed(1)}M actual (FY24)</p>
              </div>
              <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Households receiving</p>
                <p className="text-3xl font-bold text-gray-800">{Math.round(bs.recipients).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-2">{actualHH.toLocaleString()} actual (FY24)</p>
              </div>
              <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Average benefit</p>
                <p className="text-3xl font-bold text-gray-800">${Math.round(bs.avg_benefit).toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-2">${actualAvg.toLocaleString()} actual (FY24)</p>
              </div>
            </div>
          </div>

          {/* Repeal */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">{repealYear} — LIHEAP repealed</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-5 border bg-red-50 border-red-200">
                <p className="text-sm text-gray-600 mb-1">Total benefits lost</p>
                <p className="text-3xl font-bold text-red-600">-${(Math.abs(data.total_cost) / 1e6).toFixed(1)}M</p>
              </div>
              <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Households losing benefits</p>
                <p className="text-3xl font-bold text-gray-800">{Math.round(data.affected_households).toLocaleString()}</p>
              </div>
              <div className="rounded-lg p-5 border bg-gray-50 border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Average loss per household</p>
                <p className="text-3xl font-bold text-gray-800">${Math.abs(data.avg_loss).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>

          {/* Income bracket table */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Impact by income bracket</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left px-4 py-3 font-medium text-gray-900">Income bracket</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Households affected</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Total loss</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Average loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.by_income_bracket.map((b, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{b.bracket}</td>
                      <td className="px-4 py-3 text-gray-700 text-right">{Math.round(b.affected).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-right text-red-600">{formatBillions(b.total_loss)}</td>
                      <td className="px-4 py-3 font-semibold text-right text-red-600">{formatCurrencyWithSign(b.avg_loss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-2">Validation against actual {selectedState} LIHEAP data</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p>Recipients</p>
                <p className="font-semibold">{Math.round(rs.recipients).toLocaleString()} estimated</p>
                <p className="text-gray-400">{actualHH.toLocaleString()} actual (FY24)</p>
              </div>
              <div>
                <p>Total spending</p>
                <p className="font-semibold">${(rs.total_spending / 1e6).toFixed(1)}M estimated</p>
                <p className="text-gray-400">${(actualSpending / 1e6).toFixed(1)}M actual (FY24)</p>
              </div>
              <div>
                <p>Avg benefit</p>
                <p className="font-semibold">${Math.round(rs.avg_benefit)} estimated</p>
                <p className="text-gray-400">${actualAvg} actual (FY24)</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-400">
              <a href={STATE_PROFILE_URLS[selectedState]} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                ACF LIHEAP FY2024 {selectedState} State Profile
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ===== DISTRIBUTIONAL ===== */}
      {activeSection === 'distributional' && (() => {
        const isRelative = distMode === 'relative';
        const rawValues = isRelative
          ? Object.values(data.decile.relative).map(v => v * 100)
          : Object.values(data.decile.average);
        const maxAbs = Math.max(...rawValues.map(Math.abs), 0.01);
        const niceStep = (() => {
          const rough = maxAbs / 3;
          if (rough < 0.01) return 0.01;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;
        const symmetricDomain = [-niceMax, niceMax];
        const niceTicks = Array.from(
          { length: Math.round(2 * niceMax / niceStep) + 1 },
          (_, i) => parseFloat((-niceMax + i * niceStep).toFixed(10)),
        );
        const chartData = isRelative
          ? Object.entries(data.decile.relative).map(([k, v]) => ({ decile: k, value: v * 100 }))
          : Object.entries(data.decile.average).map(([k, v]) => ({ decile: k, value: v }));

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-lg font-semibold text-gray-800">Impact by income decile</h3>
              <div className="flex gap-1">
                {(['relative', 'absolute'] as const).map((mode) => (
                  <button key={mode} onClick={() => setDistMode(mode)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      distMode === mode ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}>{mode === 'relative' ? 'Relative' : 'Absolute'}</button>
                ))}
              </div>
            </div>
            <p className="text-gray-700">
              {isRelative
                ? 'Change in household net income as a percentage of baseline income, by decile.'
                : 'Average change in household net income in dollars, by decile.'}
            </p>
            <div className="bg-white border rounded-lg p-6">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="decile" tick={TICK_STYLE} stroke="#A0AEC0"
                    label={{ value: 'Income decile', position: 'insideBottom', offset: -15, style: { ...TICK_STYLE, fill: '#718096' } }} />
                  <YAxis domain={symmetricDomain} ticks={niceTicks}
                    tickFormatter={isRelative ? (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : formatCurrencyWithSign}
                    tick={TICK_STYLE} stroke="#A0AEC0" width={isRelative ? 70 : 80} />
                  <Tooltip content={<CustomTooltip formatter={isRelative
                    ? (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`
                    : (v) => formatCurrencyWithSign(v)} />} />
                  <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                  <Bar dataKey="value" name={isRelative ? 'Relative impact' : 'Average impact'} radius={[2, 2, 0, 0]}>
                    {rawValues.map((v, i) => (
                      <Cell key={i} fill={v >= 0 ? COLORS.positive : COLORS.negative} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
            </div>
          </div>
        );
      })()}

      {/* ===== WINNERS & LOSERS ===== */}
      {activeSection === 'winners' && (() => {
        const intra = data.intra_decile;
        const categories = [
          { key: 'gain_more_than_5pct', label: 'Gain more than 5%', color: COLORS.gainMore5 },
          { key: 'gain_less_than_5pct', label: 'Gain less than 5%', color: COLORS.gainLess5 },
          { key: 'no_change', label: 'No change', color: COLORS.noChange },
          { key: 'lose_less_than_5pct', label: 'Lose less than 5%', color: COLORS.loseLess5 },
          { key: 'lose_more_than_5pct', label: 'Lose more than 5%', color: COLORS.loseMore5 },
        ] as const;

        const stackedData = [
          { label: 'All', ...Object.fromEntries(categories.map(c => [c.key, (intra.all[c.key] * 100)])) },
          ...Array.from({ length: 10 }, (_, i) => {
            const d = 10 - i;
            return { label: `${d}`, ...Object.fromEntries(categories.map(c => [c.key, (intra.deciles[c.key][d - 1] * 100)])) };
          }),
        ];

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg p-5 border" style={{ backgroundColor: '#F0FDFA', borderColor: COLORS.positive }}>
                <p className="text-sm text-gray-600 mb-1">Winners</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.gainMore5 }}>{data.winners_rate.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">No change</p>
                <p className="text-3xl font-bold text-gray-600">{(100 - data.winners_rate - data.losers_rate).toFixed(1)}%</p>
              </div>
              <div className="rounded-lg p-5 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#EF4444' }}>
                <p className="text-sm text-gray-600 mb-1">Losers</p>
                <p className="text-3xl font-bold text-red-600">{data.losers_rate.toFixed(1)}%</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Winners & losers by income decile</h3>
              <div className="bg-white border rounded-lg p-6">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={stackedData} layout="vertical" stackOffset="expand" barSize={24} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis type="number" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tick={TICK_STYLE} stroke="#A0AEC0" />
                    <YAxis type="category" dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" width={40} />
                    <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
                    {categories.map((c) => (
                      <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <ChartWatermark />
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4A5568' }}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== POVERTY ===== */}
      {activeSection === 'poverty' && (() => {
        const pov = data.poverty;
        const povertyMetrics = [
          { label: 'Overall poverty', baseline: pov.poverty.all.baseline, reform: pov.poverty.all.reform },
          { label: 'Child poverty', baseline: pov.poverty.child.baseline, reform: pov.poverty.child.reform },
          { label: 'Deep poverty', baseline: pov.deep_poverty.all.baseline, reform: pov.deep_poverty.all.reform },
          { label: 'Deep child poverty', baseline: pov.deep_poverty.child.baseline, reform: pov.deep_poverty.child.reform },
        ];

        const chartData = povertyMetrics.map((m) => {
          const pctChange = m.baseline !== 0 ? ((m.reform - m.baseline) / m.baseline) * 100 : 0;
          return { ...m, pctChange };
        });

        const pctValues = chartData.map(d => d.pctChange);
        const maxAbs = Math.max(Math.abs(Math.min(...pctValues)), Math.abs(Math.max(...pctValues)), 0.1);
        const niceStep = (() => {
          const rough = maxAbs / 3;
          if (rough < 0.1) return 0.1;
          const mag = Math.pow(10, Math.floor(Math.log10(rough)));
          const residual = rough / mag;
          if (residual <= 1) return mag;
          if (residual <= 2) return 2 * mag;
          if (residual <= 5) return 5 * mag;
          return 10 * mag;
        })();
        const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;

        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Change in poverty rates</h3>
            <div className="bg-white border rounded-lg p-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={TICK_STYLE} stroke="#A0AEC0" />
                  <YAxis domain={[-niceMax, niceMax]}
                    tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                    tick={TICK_STYLE} stroke="#A0AEC0" width={70} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} />} />
                  <ReferenceLine y={0} stroke="#A0AEC0" strokeWidth={1} />
                  <Bar dataKey="pctChange" name="Change (%)" radius={[2, 2, 0, 0]}>
                    {chartData.map((m, i) => (
                      <Cell key={i} fill={m.pctChange <= 0 ? COLORS.positive : '#EF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left px-4 py-3 font-medium text-gray-900">Metric</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Baseline</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">After repeal</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-900">Change (pp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {povertyMetrics.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{m.label}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{m.baseline.toFixed(2)}%</td>
                      <td className="px-4 py-3 text-right text-gray-700">{m.reform.toFixed(2)}%</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                        +{(m.reform - m.baseline).toFixed(2)}pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
        {dataSource === 'survey'
          ? 'CPS survey estimates use self-reported energy assistance data (all types: heating, cooling, crisis). Static analysis — no behavioral responses.'
          : `${modelMeta?.description || 'PolicyEngine modeled'} — heating assistance only. ${modelMeta?.assumptions ? `Assumptions: ${modelMeta.assumptions}.` : ''} Static analysis — no behavioral responses.`
        }
      </p>
    </div>
  );
}
