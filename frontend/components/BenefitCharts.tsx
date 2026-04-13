'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  generateSurface,
  generateIncomeLines,
  CHART_HEATING_TYPES,
} from '@/lib/liheapData';

// Lazy-load Plotly (large bundle, no SSR)
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[420px] bg-gray-50 rounded-lg border border-gray-200">
      <p className="text-sm text-gray-400">Loading 3D chart...</p>
    </div>
  ),
});

const TEAL_COLORSCALE: [number, string][] = [
  [0, '#E6FFFA'],
  [0.2, '#B2F5EA'],
  [0.4, '#81E6D9'],
  [0.6, '#38B2AC'],
  [0.8, '#2C7A7B'],
  [1, '#1D4044'],
];

const TOOLTIP_STYLE = {
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 12px',
};

const fmt = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface Props {
  state: string;
}

export default function BenefitCharts({ state }: Props) {
  const types = CHART_HEATING_TYPES[state] || [];
  const [heatingType, setHeatingType] = useState(types[0]?.value || '');
  const [householdSize, setHouseholdSize] = useState(1);
  const [housingType, setHousingType] = useState('MULTI_FAMILY');
  const [subsidized, setSubsidized] = useState(false);
  const [chartExpense, setChartExpense] = useState(3000);

  // Reset heating type when state changes
  useEffect(() => {
    const newTypes = CHART_HEATING_TYPES[state] || [];
    setHeatingType(newTypes[0]?.value || '');
  }, [state]);

  // 3D surface data
  const surface = useMemo(
    () => generateSurface({ state, heatingType, householdSize, housingType, subsidized }),
    [state, heatingType, householdSize, housingType, subsidized],
  );

  // 2D line chart data (benefit vs income for all heating types)
  const lineData = useMemo(
    () => generateIncomeLines({
      state, householdSize, heatingExpense: chartExpense, housingType, subsidized,
    }),
    [state, householdSize, chartExpense, housingType, subsidized],
  );

  const selectedType = types.find((t) => t.value === heatingType);

  return (
    <section className="mt-8 space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Explore Benefit Structure
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          See how income and heating costs determine your LIHEAP benefit amount.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Heating Type</label>
            <select
              value={heatingType}
              onChange={(e) => setHeatingType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Household Size</label>
            <select
              value={householdSize}
              onChange={(e) => setHouseholdSize(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {(state === 'IL' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4]).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
              ))}
            </select>
          </div>
          {state === 'DC' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Housing Type</label>
              <select
                value={housingType}
                onChange={(e) => setHousingType(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="MULTI_FAMILY">Multi-Family</option>
                <option value="SINGLE_FAMILY">Single Family</option>
              </select>
            </div>
          )}
          {state === 'MA' && (
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-1">
                <input
                  type="checkbox"
                  checked={subsidized}
                  onChange={(e) => setSubsidized(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Subsidized housing
              </label>
            </div>
          )}
        </div>

        {/* 3D Surface Chart */}
        <div className="mb-8">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Benefit Landscape: {selectedType?.label || heatingType}
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Drag to rotate, scroll to zoom. Benefits are capped at your actual heating expense
            {heatingType === 'HEAT_IN_RENT' || heatingType === 'CASH'
              ? ' (heat-in-rent bypasses the expense cap).'
              : ', creating the diagonal ridge where benefit = expense.'}
          </p>
          <div className="rounded-lg border border-gray-100 overflow-hidden bg-white">
            <Plot
              data={[
                {
                  type: 'surface' as const,
                  x: surface.incomes,
                  y: surface.expenses,
                  z: surface.benefits,
                  colorscale: TEAL_COLORSCALE,
                  hovertemplate:
                    'Income: %{x:$,.0f}<br>Heating Expense: %{y:$,.0f}<br>Benefit: %{z:$,.0f}<extra></extra>',
                  opacity: 0.92,
                },
              ]}
              layout={{
                autosize: true,
                height: 420,
                margin: { l: 0, r: 0, t: 5, b: 0 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                scene: {
                  xaxis: {
                    title: { text: 'Annual Income', font: { size: 12 } },
                    tickprefix: '$',
                    tickformat: ',.0f',
                    gridcolor: '#E2E8F0',
                  },
                  yaxis: {
                    title: { text: 'Heating Expense', font: { size: 12 } },
                    tickprefix: '$',
                    tickformat: ',.0f',
                    gridcolor: '#E2E8F0',
                  },
                  zaxis: {
                    title: { text: 'Benefit', font: { size: 12 } },
                    tickprefix: '$',
                    tickformat: ',.0f',
                    gridcolor: '#E2E8F0',
                  },
                  camera: { eye: { x: 1.8, y: -1.6, z: 0.9 } },
                  aspectratio: { x: 1.2, y: 1, z: 0.7 },
                },
              }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: '420px' }}
              useResizeHandler
            />
          </div>
        </div>

        {/* 2D Line Chart: Benefit vs Income */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700">
              Benefit by Income Level
            </h4>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Heating expense:</label>
              <select
                value={chartExpense}
                onChange={(e) => setChartExpense(Number(e.target.value))}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {[500, 1000, 1500, 2000, 3000, 5000].map((v) => (
                  <option key={v} value={v}>{fmt(v)}/yr</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Compares all heating types at a fixed annual heating expense.
            {state === 'IL' && ' Benefits drop to $0 above 200% FPL.'}
          </p>

          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={lineData} margin={{ left: 20, right: 30, top: 10, bottom: 20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="income"
                type="number"
                niceTicks="snap125"
                domain={['auto', 'auto']}
                tickFormatter={fmt}
                tick={{ fontFamily: 'Inter, sans-serif', fontSize: 11 }}
              />
              <YAxis
                niceTicks="snap125"
                domain={[0, 'auto']}
                tickFormatter={fmt}
                tick={{ fontFamily: 'Inter, sans-serif', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                separator=": "
                labelFormatter={(v) => `Income: ${fmt(v as number)}`}
                formatter={(value, name) => {
                  const ht = types.find((t) => t.value === name);
                  return [fmt(Number(value)), ht?.label || String(name)];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => {
                  const ht = types.find((t) => t.value === value);
                  return ht?.label || value;
                }}
              />
              {types.map((ht) => (
                <Line
                  key={ht.value}
                  type="stepAfter"
                  dataKey={ht.value}
                  stroke={ht.color}
                  strokeWidth={2}
                  dot={false}
                  name={ht.value}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Based on published benefit matrices. Actual eligibility depends on state income limits (60% of State Median Income).
          {state === 'MA' && ' MA chart includes HECS supplement.'}
        </p>
      </div>
    </section>
  );
}
