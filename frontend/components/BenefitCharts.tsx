'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Label,
} from 'recharts';
import type { ChartData, Selection, Series, StateGrid } from '@/lib/liheapGrid';
import {
  incomeLines, sizeLines, incomeExpenseSurface, incomeSizeSurface, lookup,
} from '@/lib/liheapGrid';

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

const WARM_COLORSCALE: [number, string][] = [
  [0, '#FFF5F5'],
  [0.2, '#FED7D7'],
  [0.4, '#FEB2B2'],
  [0.6, '#FC8181'],
  [0.8, '#E53E3E'],
  [1, '#742A2A'],
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

const AXIS_TICK = { fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' };
const AXIS_LABEL = { fontSize: 11, fill: 'var(--foreground)', opacity: 0.6 };

interface ChartProps {
  grid: StateGrid;
  selection: Selection;
  /** Mark the selected household on the chart */
  highlight: boolean;
}

function selectedSeries(series: Series[], fuel: string): Series | undefined {
  return series.find((line) => line.fuels.includes(fuel));
}

/** Legend for a chart. Fuels with identical results share one line. */
function SeriesLegend({ series, selected }: { series: Series[]; selected?: Series }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pb-1">
      {series.map((line) => {
        const isSelected = selected?.key === line.key;
        return (
          <div
            key={line.key}
            className={`flex items-center gap-1.5 text-[11px] ${isSelected ? 'font-semibold' : 'opacity-70'}`}
          >
            <span
              className="inline-block"
              style={{
                width: 14,
                borderTop: `${isSelected ? 3 : 2}px ${line.dashed ? 'dashed' : 'solid'} ${line.color}`,
              }}
            />
            <span className="text-gray-700">{line.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Lines({
  data, selected, type,
}: { data: ChartData; selected?: Series; type: 'stepAfter' | 'linear' }) {
  return data.series.map((line) => (
    <Line
      key={line.key}
      type={type}
      dataKey={line.key}
      stroke={line.color}
      strokeDasharray={line.dashed ? '5 3' : undefined}
      strokeWidth={selected?.key === line.key ? 3 : 1.5}
      strokeOpacity={selected && selected.key !== line.key ? 0.35 : 1}
      dot={type === 'linear' ? { r: 2 } : false}
      isAnimationActive={false}
      name={line.key}
    />
  ));
}

function Marker({ x, y }: { x: number; y: number }) {
  return (
    <ReferenceDot x={x} y={y} r={5} fill="var(--foreground)" stroke="var(--background)" strokeWidth={2}>
      <Label
        value={fmt(y)}
        position="top"
        offset={12}
        style={{ fontSize: 12, fontWeight: 600, fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' }}
      />
    </ReferenceDot>
  );
}

export function IncomeLineChart({ grid, selection, highlight }: ChartProps) {
  const { adults, children, variant, cooling, expense, fuel, income } = selection;
  const data = useMemo(
    () => incomeLines(grid, { adults, children, variant, cooling, expense }, income),
    [grid, adults, children, variant, cooling, expense, income],
  );
  const selected = selectedSeries(data.series, fuel);
  const result = highlight ? lookup(grid, selection) : null;

  return (
    <div className="flex h-full flex-col">
      <SeriesLegend series={data.series} selected={selected} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ left: 10, right: 10, top: 18, bottom: 25 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="income"
              type="number"
              niceTicks="snap125"
              domain={[0, 'dataMax']}
              tickFormatter={fmt}
              tick={AXIS_TICK}
              label={{ value: 'Annual income', position: 'insideBottom', offset: -18, style: AXIS_LABEL }}
            />
            <YAxis
              niceTicks="snap125"
              domain={['auto', 'auto']}
              tickFormatter={fmt}
              tick={AXIS_TICK}
              width={55}
              label={{ value: 'Benefit ($)', angle: -90, position: 'insideLeft', offset: 4, style: { ...AXIS_LABEL, textAnchor: 'middle' } }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              separator=": "
              labelFormatter={(v) => `Income: ${fmt(v as number)}`}
              formatter={(value, name) => [
                fmt(Number(value)),
                data.series.find((line) => line.key === name)?.label || String(name),
              ]}
            />
            {Lines({ data, selected, type: 'stepAfter' })}
            {result && (
              <ReferenceLine x={income} stroke="var(--foreground)" strokeDasharray="4 3" strokeWidth={1} />
            )}
            {result && <Marker x={income} y={result.benefit} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SizeLineChart({ grid, selection, highlight }: ChartProps) {
  const { adults, children, variant, cooling, expense, fuel, income } = selection;
  const data = useMemo(
    () => sizeLines(grid, { adults, variant, cooling, expense, income }),
    [grid, adults, variant, cooling, expense, income],
  );
  const selected = selectedSeries(data.series, fuel);
  const result = highlight ? lookup(grid, selection) : null;
  const sizes = data.rows.map((row) => row.size);

  return (
    <div className="flex h-full flex-col">
      <SeriesLegend series={data.series} selected={selected} />
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ left: 10, right: 20, top: 18, bottom: 25 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="size"
              type="number"
              ticks={sizes}
              domain={[sizes[0], sizes[sizes.length - 1]]}
              allowDecimals={false}
              tick={AXIS_TICK}
              label={{ value: 'Household size', position: 'insideBottom', offset: -18, style: AXIS_LABEL }}
            />
            <YAxis
              niceTicks="snap125"
              domain={['auto', 'auto']}
              tickFormatter={fmt}
              tick={AXIS_TICK}
              width={55}
              label={{ value: 'Benefit ($)', angle: -90, position: 'insideLeft', offset: 4, style: { ...AXIS_LABEL, textAnchor: 'middle' } }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              separator=": "
              labelFormatter={(v) => `Household size: ${v}`}
              formatter={(value, name) => [
                fmt(Number(value)),
                data.series.find((line) => line.key === name)?.label || String(name),
              ]}
            />
            {Lines({ data, selected, type: 'linear' })}
            {result && (
              <ReferenceLine x={adults + children} stroke="var(--foreground)" strokeDasharray="4 3" strokeWidth={1} />
            )}
            {result && <Marker x={adults + children} y={result.benefit} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Surface({
  x, y, z, yTitle, yIsCount, colorscale, hover, height,
}: {
  x: number[]; y: number[]; z: number[][]; yTitle: string; yIsCount: boolean;
  colorscale: [number, string][]; hover: string; height: number;
}) {
  const trace: any = {
    type: 'surface',
    x, y, z,
    colorscale,
    showscale: false,
    hovertemplate: hover,
    opacity: 0.92,
    contours: {
      z: { show: true, usecolormap: true, highlightcolor: 'rgba(255,255,255,0.3)', project: { z: true } },
    },
  };
  const axis = { gridcolor: '#E2E8F0', tickfont: { size: 12 } };
  return (
    <Plot
      data={[trace]}
      layout={{
        autosize: true,
        height,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        scene: {
          xaxis: { ...axis, title: { text: 'Income', font: { size: 14 } }, tickprefix: '$', tickformat: ',.0f' },
          yaxis: yIsCount
            ? { ...axis, title: { text: yTitle, font: { size: 14 } }, tickformat: 'd', dtick: 1 }
            : { ...axis, title: { text: yTitle, font: { size: 14 } }, tickprefix: '$', tickformat: ',.0f' },
          zaxis: { ...axis, title: { text: 'Benefit', font: { size: 14 } }, tickprefix: '$', tickformat: ',.0f' },
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

/** Benefit over income and bill level for the selected heating source. */
export function Surface3DChart({ grid, selection, height = 360 }: Omit<ChartProps, 'highlight'> & { height?: number }) {
  const { adults, children, variant, cooling, fuel } = selection;
  const surface = useMemo(
    () => incomeExpenseSurface(grid, { adults, children, variant, cooling, fuel }),
    [grid, adults, children, variant, cooling, fuel],
  );
  return (
    <Surface
      x={surface.incomes}
      y={surface.expenses}
      z={surface.benefits}
      yTitle="Yearly bill"
      yIsCount={false}
      colorscale={TEAL_COLORSCALE}
      hover="Income: %{x:$,.0f}<br>Bill: %{y:$,.0f}<br>Benefit: %{z:$,.0f}<extra></extra>"
      height={height}
    />
  );
}

/** Benefit over income and household size for the selected heating source. */
export function SizeIncome3DChart({ grid, selection, height = 360 }: Omit<ChartProps, 'highlight'> & { height?: number }) {
  const { adults, variant, cooling, fuel, expense } = selection;
  const surface = useMemo(
    () => incomeSizeSurface(grid, { adults, variant, cooling, fuel, expense }),
    [grid, adults, variant, cooling, fuel, expense],
  );
  return (
    <Surface
      x={surface.incomes}
      y={surface.sizes}
      z={surface.benefits}
      yTitle="Household size"
      yIsCount
      colorscale={WARM_COLORSCALE}
      hover="Income: %{x:$,.0f}<br>Size: %{y}<br>Benefit: %{z:$,.0f}<extra></extra>"
      height={height}
    />
  );
}
