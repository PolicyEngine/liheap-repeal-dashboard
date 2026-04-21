'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Label,
} from 'recharts';
import type { LiheapData } from '@/lib/liheapData';
import {
  generateSurface,
  generateSizeSurface,
  generateIncomeLines,
  generateExpenseLines,
  generateSizeLines,
  generateCoverageLines,
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

const withHeadroom = (dataMax: number) => (dataMax <= 0 ? 1 : dataMax * 1.2);

export interface ChartParams {
  state: string;
  heatingType: string;
  householdSize: number;
  housingType: string;
  subsidized: boolean;
  data: LiheapData;
}

export function Surface3DChart({
  state, heatingType, householdSize, housingType, subsidized, data, height = 360,
}: ChartParams & { height?: number }) {
  const surface = useMemo(
    () => generateSurface({ state, heatingType, householdSize, housingType, subsidized, data, gridSize: 30 }),
    [state, heatingType, householdSize, housingType, subsidized, data],
  );

  const trace: any = {
    type: 'surface',
    x: surface.incomes,
    y: surface.expenses,
    z: surface.benefits,
    colorscale: TEAL_COLORSCALE,
    showscale: false,
    hovertemplate:
      'Income: %{x:$,.0f}<br>Expense: %{y:$,.0f}<br>Benefit: %{z:$,.0f}<extra></extra>',
    opacity: 0.92,
    contours: {
      z: {
        show: true,
        usecolormap: true,
        highlightcolor: 'rgba(255,255,255,0.3)',
        project: { z: true },
      },
    },
  };

  return (
    <Plot
      data={[trace]}
      layout={{
        autosize: true,
        height,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        scene: {
          xaxis: {
            title: { text: 'Income', font: { size: 14 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
          },
          yaxis: {
            title: { text: 'Heating Expense', font: { size: 14 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
          },
          zaxis: {
            title: { text: 'Benefit', font: { size: 14 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
          },
          camera: { eye: { x: 1.15, y: -1.42, z: 0.72 } },
          aspectratio: { x: 1.4, y: 1.1, z: 0.7 },
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
    () => generateIncomeLines({ state, householdSize, heatingExpense: chartExpense, housingType, subsidized, data, highlightIncome }),
    [state, householdSize, chartExpense, housingType, subsidized, data, highlightIncome],
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
      <LineChart data={lineData} margin={{ left: 10, right: 10, top: 5, bottom: 25 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="income"
          type="number"
          niceTicks="snap125"
          domain={[0, 'auto']}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          label={{ value: 'Annual Income', position: 'insideBottom', offset: -18, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6 } }}
        />
        <YAxis
          niceTicks="snap125"
          domain={[0, withHeadroom]}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          width={55}
          label={{ value: 'Benefit ($)', angle: -90, position: 'insideLeft', offset: 4, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6, textAnchor: 'middle' } }}
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
        {types.map((ht) => (
          <Line
            key={ht.value}
            type="stepAfter"
            dataKey={ht.value}
            stroke={ht.color}
            strokeWidth={highlightHeatingType === ht.value ? 3 : 1.5}
            strokeOpacity={highlightHeatingType && highlightHeatingType !== ht.value ? 0.35 : 1}
            dot={false}
            name={ht.value}
          />
        ))}
        {highlightIncome != null && (
          <ReferenceLine
            x={highlightIncome}
            stroke="var(--foreground)"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}
        {highlightIncome != null && highlightBenefit != null && highlightHeatingType && (
          <ReferenceDot
            x={highlightIncome}
            y={highlightBenefit}
            r={5}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={2}
          >
            <Label
              value={fmt(highlightBenefit)}
              position="top"
              offset={12}
              style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' }}
            />
          </ReferenceDot>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ExpenseLineChart({
  state, householdSize, housingType, subsidized, data, chartIncome,
  highlightExpense, highlightHeatingType,
}: Omit<ChartParams, 'heatingType'> & {
  chartIncome: number;
  highlightExpense?: number;
  highlightHeatingType?: string;
}) {
  const types = CHART_HEATING_TYPES[state] || [];

  const lineData = useMemo(
    () => generateExpenseLines({ state, householdSize, income: chartIncome, housingType, subsidized, data, highlightExpense }),
    [state, householdSize, chartIncome, housingType, subsidized, data, highlightExpense],
  );

  const highlightBenefit = useMemo(() => {
    if (highlightExpense == null || !highlightHeatingType) return null;
    return computeBenefit({
      state, heatingType: highlightHeatingType, income: chartIncome,
      heatingExpense: highlightExpense, householdSize, housingType, subsidized,
    }, data);
  }, [state, highlightHeatingType, highlightExpense, chartIncome, householdSize, housingType, subsidized, data]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="expense"
          type="number"
          niceTicks="snap125"
          domain={[0, 'auto']}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}

        />
        <YAxis
          niceTicks="snap125"
          domain={[0, withHeadroom]}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          width={55}
          label={{ value: 'Benefit ($)', angle: -90, position: 'insideLeft', offset: 4, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6, textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          separator=": "
          labelFormatter={(v) => `Expense: ${fmt(v as number)}`}
          formatter={(value, name) => {
            const ht = types.find((t) => t.value === name);
            return [fmt(Number(value)), ht?.label || String(name)];
          }}
        />
        {types.map((ht) => (
          <Line
            key={ht.value}
            type="linear"
            dataKey={ht.value}
            stroke={ht.color}
            strokeWidth={highlightHeatingType === ht.value ? 3 : 1.5}
            strokeOpacity={highlightHeatingType && highlightHeatingType !== ht.value ? 0.35 : 1}
            dot={false}
            name={ht.value}
          />
        ))}
        {highlightExpense != null && (
          <ReferenceLine
            x={highlightExpense}
            stroke="var(--foreground)"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}
        {highlightExpense != null && highlightBenefit != null && highlightHeatingType && (
          <ReferenceDot
            x={highlightExpense}
            y={highlightBenefit}
            r={5}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={2}
          >
            <Label
              value={fmt(highlightBenefit)}
              position="top"
              offset={10}
              style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' }}
            />
          </ReferenceDot>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

const WARM_COLORSCALE: [number, string][] = [
  [0, '#FFF5F5'],
  [0.2, '#FED7D7'],
  [0.4, '#FEB2B2'],
  [0.6, '#FC8181'],
  [0.8, '#E53E3E'],
  [1, '#742A2A'],
];

export function SizeIncome3DChart({
  state, heatingType, housingType, subsidized, data, heatingExpense, height = 360,
}: Omit<ChartParams, 'householdSize'> & { heatingExpense: number; height?: number }) {
  const surface = useMemo(
    () => generateSizeSurface({ state, heatingType, heatingExpense, housingType, subsidized, data }),
    [state, heatingType, heatingExpense, housingType, subsidized, data],
  );

  const trace: any = {
    type: 'surface',
    x: surface.incomes,
    y: surface.sizes,
    z: surface.benefits,
    colorscale: WARM_COLORSCALE,
    showscale: false,
    hovertemplate:
      'Income: %{x:$,.0f}<br>Size: %{y}<br>Benefit: %{z:$,.0f}<extra></extra>',
    opacity: 0.92,
    contours: {
      z: {
        show: true,
        usecolormap: true,
        highlightcolor: 'rgba(255,255,255,0.3)',
        project: { z: true },
      },
    },
  };

  return (
    <Plot
      data={[trace]}
      layout={{
        autosize: true,
        height,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        scene: {
          xaxis: {
            title: { text: 'Income', font: { size: 14 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
          },
          yaxis: {
            title: { text: 'Household Size', font: { size: 14 } },
            tickformat: 'd',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
            dtick: 1,
          },
          zaxis: {
            title: { text: 'Benefit', font: { size: 14 } },
            tickprefix: '$', tickformat: ',.0f',
            gridcolor: '#E2E8F0', tickfont: { size: 12 },
          },
          camera: { eye: { x: 1.15, y: -1.42, z: 0.72 } },
          aspectratio: { x: 1.4, y: 1.1, z: 0.7 },
          domain: { x: [0, 1], y: [0, 1] },
        },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: `${height}px` }}
      useResizeHandler
    />
  );
}

export function SizeLineChart({
  state, income, heatingExpense, housingType, subsidized, data, highlightSize, highlightHeatingType,
}: {
  state: string;
  income: number;
  heatingExpense: number;
  housingType?: string;
  subsidized?: boolean;
  data: LiheapData;
  highlightSize?: number;
  highlightHeatingType?: string;
}) {
  const types = CHART_HEATING_TYPES[state] || [];

  const lineData = useMemo(
    () => generateSizeLines({ state, income, heatingExpense, housingType, subsidized, data }),
    [state, income, heatingExpense, housingType, subsidized, data],
  );

  const highlightBenefit = useMemo(() => {
    if (highlightSize == null || !highlightHeatingType) return null;
    return computeBenefit({
      state, heatingType: highlightHeatingType, income,
      heatingExpense, householdSize: highlightSize, housingType, subsidized,
    }, data);
  }, [state, highlightHeatingType, highlightSize, income, heatingExpense, housingType, subsidized, data]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lineData} margin={{ left: 10, right: 20, top: 5, bottom: 25 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="size"
          type="number"
          ticks={[1, 2, 3, 4, 5, 6]}
          domain={[1, 6]}
          allowDecimals={false}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          label={{ value: 'Household Size', position: 'insideBottom', offset: -18, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6 } }}
        />
        <YAxis
          niceTicks="snap125"
          domain={[0, withHeadroom]}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          width={55}
          label={{ value: 'Benefit ($)', angle: -90, position: 'insideLeft', offset: 4, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6, textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          separator=": "
          labelFormatter={(v) => `Household size: ${v}`}
          formatter={(value, name) => {
            const ht = types.find((t) => t.value === name);
            return [fmt(Number(value)), ht?.label || String(name)];
          }}
        />
        {types.map((ht) => (
          <Line
            key={ht.value}
            type="linear"
            dataKey={ht.value}
            stroke={ht.color}
            strokeWidth={highlightHeatingType === ht.value ? 3 : 1.5}
            strokeOpacity={highlightHeatingType && highlightHeatingType !== ht.value ? 0.35 : 1}
            dot={false}
            name={ht.value}
          />
        ))}
        {highlightSize != null && (
          <ReferenceLine x={highlightSize} stroke="var(--foreground)" strokeDasharray="4 3" strokeWidth={1} />
        )}
        {highlightSize != null && highlightBenefit != null && highlightHeatingType && (
          <ReferenceDot
            x={highlightSize}
            y={highlightBenefit}
            r={5}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={2}
          >
            <Label
              value={fmt(highlightBenefit)}
              position="top"
              offset={12}
              style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' }}
            />
          </ReferenceDot>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CoverageLineChart({
  state, householdSize, housingType, subsidized, data, chartIncome,
  highlightExpense, highlightHeatingType,
}: Omit<ChartParams, 'heatingType'> & {
  chartIncome: number;
  highlightExpense?: number;
  highlightHeatingType?: string;
}) {
  const types = CHART_HEATING_TYPES[state] || [];
  const pctFmt = (v: number) => `${Math.round(v)}%`;

  const lineData = useMemo(
    () => generateCoverageLines({ state, householdSize, income: chartIncome, housingType, subsidized, data, highlightExpense }),
    [state, householdSize, chartIncome, housingType, subsidized, data, highlightExpense],
  );

  const highlightCoverage = useMemo(() => {
    if (highlightExpense == null || highlightExpense <= 0 || !highlightHeatingType) return null;
    const benefit = computeBenefit({
      state, heatingType: highlightHeatingType, income: chartIncome,
      heatingExpense: highlightExpense, householdSize, housingType, subsidized,
    }, data);
    return Math.min(100, (benefit / highlightExpense) * 100);
  }, [state, highlightHeatingType, highlightExpense, chartIncome, householdSize, housingType, subsidized, data]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={lineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="expense"
          type="number"
          niceTicks="snap125"
          domain={[0, 'auto']}
          tickFormatter={fmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
        />
        <YAxis
          niceTicks="snap125"
          domain={[0, 100]}
          tickFormatter={pctFmt}
          tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
          width={45}
          label={{ value: '% Covered', angle: -90, position: 'insideLeft', offset: 4, style: { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6, textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          separator=": "
          labelFormatter={(v) => `Expense: ${fmt(v as number)}`}
          formatter={(value, name) => {
            const ht = types.find((t) => t.value === name);
            return [pctFmt(Number(value)), ht?.label || String(name)];
          }}
        />
        {types.map((ht) => (
          <Line
            key={ht.value}
            type="linear"
            dataKey={ht.value}
            stroke={ht.color}
            strokeWidth={highlightHeatingType === ht.value ? 3 : 1.5}
            strokeOpacity={highlightHeatingType && highlightHeatingType !== ht.value ? 0.35 : 1}
            dot={false}
            name={ht.value}
          />
        ))}
        {highlightExpense != null && (
          <ReferenceLine x={highlightExpense} stroke="var(--foreground)" strokeDasharray="4 3" strokeWidth={1} />
        )}
        {highlightExpense != null && highlightCoverage != null && highlightHeatingType && (
          <ReferenceDot
            x={highlightExpense}
            y={highlightCoverage}
            r={5}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={2}
          >
            <Label
              value={pctFmt(highlightCoverage)}
              position="top"
              offset={10}
              style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' }}
            />
          </ReferenceDot>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
