'use client';

import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import ChartWatermark from './ChartWatermark';

const COLORS = {
  gainMore5: '#285E61',
  gainLess5: '#31979599',
  noChange: '#E2E8F0',
  loseLess5: '#9CA3AF',
  loseMore5: '#4B5563',
  positive: '#319795',
  negative: '#4B5563',
};

const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };
const TICK_STYLE = { fontFamily: 'Inter, sans-serif', fontSize: 12 };

const STATE_LABELS: Record<string, string> = {
  DC: 'Washington DC',
  MA: 'Massachusetts',
  IL: 'Illinois',
};

const STATE_PROFILE_URLS: Record<string, string> = {
  DC: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_DistrictofColumbia_Profile.pdf',
  MA: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_Massachusetts_Profile.pdf',
  IL: 'https://liheappm.acf.gov/sites/default/files/private/congress/profiles/2024/FY2024_Illinois_Profile.pdf',
};

interface StateData {
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
  validation: {
    model_recipients: number;
    model_total_spending: number;
    model_avg_benefit: number;
    actual_heating_hh: number;
    actual_heating_spending: number;
    actual_avg_benefit: number;
  };
}

interface AllData {
  meta: { year: number; states: string[] };
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

export default function AggregateImpact() {
  const [allData, setAllData] = useState<AllData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState('DC');
  const [activeSection, setActiveSection] = useState<'fiscal' | 'distributional' | 'winners' | 'poverty'>('fiscal');
  const [distMode, setDistMode] = useState<'relative' | 'absolute'>('relative');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
          <p className="mt-4 text-gray-600">Loading impact data...</p>
        </div>
      </div>
    );
  }

  if (error || !allData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-gray-800 font-semibold mb-2">Impact data not available</h3>
        <p className="text-gray-600">{error}</p>
        <p className="text-sm text-gray-500 mt-4">
          Run: <code>python scripts/generate_liheap_impacts.py</code>
        </p>
      </div>
    );
  }

  const data = allData.states[selectedState];
  if (!data) return null;

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

  const sections = [
    { key: 'fiscal' as const, label: 'Budgetary impact' },
    { key: 'distributional' as const, label: 'Distributional impact' },
    { key: 'winners' as const, label: 'Winners & losers' },
    { key: 'poverty' as const, label: 'Poverty impact' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Impact of LIHEAP repeal</h2>

      {/* State selector */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(allData.states).map((st) => (
          <button
            key={st}
            onClick={() => setSelectedState(st)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedState === st
                ? 'bg-primary-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {STATE_LABELS[st] || st}
          </button>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === s.key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== FISCAL ===== */}
      {activeSection === 'fiscal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg p-6 border bg-red-50 border-red-300">
              <p className="text-sm text-gray-700 mb-2">Total benefits lost</p>
              <p className="text-3xl font-bold text-red-600">{formatBillions(data.total_cost)}</p>
            </div>
            <div className="rounded-lg p-6 border bg-gray-50 border-gray-300">
              <p className="text-sm text-gray-700 mb-2">Households affected</p>
              <p className="text-3xl font-bold text-gray-800">{Math.round(data.affected_households).toLocaleString()}</p>
            </div>
            <div className="rounded-lg p-6 border bg-gray-50 border-gray-300">
              <p className="text-sm text-gray-700 mb-2">Average loss per household</p>
              <p className="text-3xl font-bold text-gray-800">${Math.abs(data.avg_loss).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Impact by income bracket</h3>
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
                <p className="font-semibold">{Math.round(data.validation.model_recipients).toLocaleString()} model</p>
                <p className="text-gray-400">
                  {data.validation.actual_heating_hh.toLocaleString()} actual (FY24)
                </p>
              </div>
              <div>
                <p>Total spending</p>
                <p className="font-semibold">{formatBillions(-data.validation.model_total_spending)} model</p>
                <p className="text-gray-400">${(data.validation.actual_heating_spending / 1e6).toFixed(1)}M actual (FY24)</p>
              </div>
              <div>
                <p>Avg benefit</p>
                <p className="font-semibold">${Math.round(data.validation.model_avg_benefit)} model</p>
                <p className="text-gray-400">${data.validation.actual_avg_benefit} actual (FY24)</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-400 space-y-1">
              <p>
                All actuals (FY24):{' '}
                <a href={STATE_PROFILE_URLS[selectedState]} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  ACF LIHEAP FY2024 {selectedState} State Profile
                </a>
              </p>
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
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#F0FDFA', borderColor: COLORS.positive }}>
                <p className="text-sm text-gray-700 mb-2">Winners</p>
                <p className="text-3xl font-bold" style={{ color: COLORS.gainMore5 }}>{data.winners_rate.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                <p className="text-sm text-gray-700 mb-2">No change</p>
                <p className="text-3xl font-bold text-gray-600">
                  {(100 - data.winners_rate - data.losers_rate).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg p-6 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#EF4444' }}>
                <p className="text-sm text-gray-700 mb-2">Losers</p>
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

            {/* Rate table */}
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
        These estimates use CPS/SPM self-reported energy assistance data. They are static and do not
        capture behavioral responses. The energy subsidy variable captures LIHEAP and similar programs.
      </p>
    </div>
  );
}
