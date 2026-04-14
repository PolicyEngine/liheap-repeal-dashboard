'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceDot,
} from 'recharts';
import type { LiheapData } from '@/lib/liheapData';
import {
  generateSurface,
  generateIncomeLines,
  computeBenefit,
  CHART_HEATING_TYPES,
} from '@/lib/liheapData';

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
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
  padding: '6px 10px',
  fontSize: 12,
};

const fmt = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export interface ChartParams {
  state: string;
  heatingType: string;
  householdSize: number;
  housingType: string;
  subsidized: boolean;
  data?: LiheapData;
}

export function Surface3DChart({
  state, heatingType, householdSize, housingType, subsidized, data, height = 360,
}: ChartParams & { height?: number }) {
  const surface = useMemo(
    () => generateSurface({ state, heatingType, householdSize, housingType, subsidized, data, gridSize: 30 }),
    [state, heatingType, householdSize, housingType, subsidized, data],
  );

  return (
    <Plot
      data={[
        {
          type: 'surface' as const,
          x: surface.incomes,
          y: surface.expenses,
          z: surface.benefits,
          colorscale: TEAL_COLORSCALE,
          showscale: false,
          hovertemplate:
            'Income: %{x:$,.0f}<br>Expense: %{y:$,.0f}<br>Benefit: %{z:$,.0f}<extra></extra>',
          opacity: 0.92,
        },
      ]}
      layout={{
        autosize: true,
        height,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        scene: {
          xaxis: {
            title: { text: 'Income', font: { size: 11 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 9 },
          },
          yaxis: {
            title: { text: 'Heating Expense', font: { size: 11 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 9 },
          },
          zaxis: {
            title: { text: 'Benefit', font: { size: 11 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 9 },
          },
          camera: { eye: { x: 1.6, y: -1.4, z: 0.8 } },
          aspectratio: { x: 1.3, y: 1, z: 0.7 },
          domain: { x: [0, 1], y: [0, 1] },
        },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: `${height}px` }}
      useResizeHandler
    />
  );
}

export function IncomeLineChart({
  state, householdSize, housingType, subsidized, data, chartExpense,
  highlightIncome, highlightHeatingType,
}: Omit<ChartParams, 'heatingType'> & {
  chartExpense: number;
  highlightIncome?: number;
  highlightHeatingType?: string;
}) {
  const types = CHART_HEATING_TYPES[state] || [];

  const lineData = useMemo(
    () => generateIncomeLines({ state, householdSize, heatingExpense: chartExpense, housingType, subsidized, data }),
    [state, householdSize, chartExpense, housingType, subsidized, data],
  );

  // Compute the highlighted point's benefit
  const highlightBenefit = useMemo(() => {
    if (highlightIncome == null || !highlightHeatingType) return null;
    return computeBenefit({
      state, heatingType: highlightHeatingType, income: highlightIncome,
      heatingExpense: chartExpense, householdSize, housingType, subsidized,
    }, data);
  }, [state, highlightHeatingType, highlightIncome, chartExpense, householdSize, housingType, subsidized, data]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="income"
          type="number"
          niceTicks="snap125"
          domain={['auto', 'auto']}
          tickFormatter={fmt}
          tick={{ fontFamily: 'Inter, sans-serif', fontSize: 10 }}
        />
        <YAxis
          niceTicks="snap125"
          domain={[0, 'auto']}
          tickFormatter={fmt}
          tick={{ fontFamily: 'Inter, sans-serif', fontSize: 10 }}
          width={55}
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
          wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
          iconSize={10}
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
        {highlightIncome != null && highlightBenefit != null && highlightHeatingType && (
          <ReferenceDot
            x={highlightIncome}
            y={highlightBenefit}
            r={5}
            fill="#1D4044"
            stroke="#fff"
            strokeWidth={2}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
