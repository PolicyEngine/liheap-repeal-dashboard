'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { StateGrid } from '@/lib/liheapGrid';
import {
  STATES, YEARS, ELECTRICITY, HEAT_IN_RENT, NO_HEATING,
  fuelUsesBill, loadStateGrid, lookup, maxIncome,
} from '@/lib/liheapGrid';

const fmt = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtInt = (v: number) => v.toLocaleString('en-US');
const parseInput = (s: string) => Number(s.replace(/[^0-9]/g, '')) || 0;

const INCOME_STEP = 500;

interface Row {
  code: string;
  name: string;
  benefit: number;
  eligible: boolean;
  /** The income is above the highest income run for this state */
  aboveRange: boolean;
}

/** One household in every state: the quickest way to spot a state that stands out. */
export default function StateComparison() {
  const [year, setYear] = useState(YEARS[0].value);
  const [nAdults, setNAdults] = useState(1);
  const [nChildren, setNChildren] = useState(2);
  const [incomeInput, setIncomeInput] = useState(20000);
  const [fuel, setFuel] = useState('NATURAL_GAS');
  const [expense, setExpense] = useState(1500);
  const [loaded, setLoaded] = useState<{ year: number; grids: StateGrid[]; missing: string[] } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.allSettled(STATES.map((s) => loadStateGrid(year, s.code))).then((results) => {
      if (!current) return;
      const grids: StateGrid[] = [];
      const missing: string[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') grids.push(result.value);
        else missing.push(STATES[i].name);
      });
      setLoaded({ year, grids, missing });
    });
    return () => { current = false; };
  }, [year]);

  const grids = loaded?.year === year ? loaded.grids : null;
  const income = Math.round(incomeInput / INCOME_STEP) * INCOME_STEP;

  // Every state is run for the same fuels and bill levels; a home with no
  // heating is offered only where a state can pay one, so it is left out here.
  const fuels = grids?.[0]?.fuels.filter((f) => f.value !== NO_HEATING) ?? [];
  const expenses = grids?.[0]?.expenses ?? [];

  const rows: Row[] = useMemo(() => {
    if (!grids) return [];
    return grids
      .map((grid) => {
        const aboveRange = income > maxIncome(grid);
        const result = aboveRange
          ? null
          : lookup(grid, {
              adults: nAdults, children: nChildren, variant: 0, cooling: false,
              fuel, expense, income,
            });
        return {
          code: grid.state,
          name: grid.state === 'DC' ? 'Washington, DC' : grid.name,
          benefit: result?.benefit ?? 0,
          eligible: result?.eligible ?? false,
          aboveRange,
        };
      })
      .sort((a, b) => b.benefit - a.benefit || a.name.localeCompare(b.name));
  }, [grids, nAdults, nChildren, fuel, expense, income]);

  const paying = rows.filter((r) => r.benefit > 0);
  const sorted = paying.map((r) => r.benefit).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const none = rows.filter((r) => r.benefit === 0);
  const usesBill = fuelUsesBill(fuel);

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-3">
        <div className="flex items-end gap-x-3 gap-y-2 flex-wrap">
          <Field label="Program year" htmlFor="cmp-year">
            <select id="cmp-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className="field-input w-full">
              {YEARS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </Field>
          <Field label="Marital status" htmlFor="cmp-adults">
            <select id="cmp-adults" value={nAdults} onChange={(e) => setNAdults(Number(e.target.value))} className="field-input w-full">
              <option value={1}>Single</option>
              <option value={2}>Married</option>
            </select>
          </Field>
          <Field label="Children" htmlFor="cmp-children">
            <select id="cmp-children" value={nChildren} onChange={(e) => setNChildren(Number(e.target.value))} className="field-input w-full">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Annual income" grow htmlFor="cmp-income">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input id="cmp-income" type="text" inputMode="numeric" value={fmtInt(incomeInput)}
                onChange={(e) => setIncomeInput(parseInput(e.target.value))}
                onBlur={() => setIncomeInput(income)}
                className="field-input field-input-dollar w-full" />
            </div>
          </Field>
          <Field label="Heating" grow htmlFor="cmp-fuel">
            <select id="cmp-fuel" value={fuel} onChange={(e) => setFuel(e.target.value)} className="field-input w-full">
              {(fuels.length ? fuels : [{ value: 'NATURAL_GAS', label: 'Natural gas' }]).map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          {usesBill && (
            <Field label={fuel === ELECTRICITY ? 'Electric bill/yr' : 'Heating bill/yr'} htmlFor="cmp-expense">
              <select id="cmp-expense" value={expense} onChange={(e) => setExpense(Number(e.target.value))} className="field-input w-full">
                {(expenses.length ? expenses : [expense]).map((e) => <option key={e} value={e}>{fmt(e)}</option>)}
              </select>
            </Field>
          )}
        </div>
        {grids && (
          <p className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
            At {fmt(income)} of income, {paying.length} of {rows.length} jurisdictions pay this household
            {paying.length > 0 && (
              <>, from {fmt(sorted[0])} to {fmt(sorted[sorted.length - 1])} with a median of {fmt(median)}</>
            )}
            .{fuel === HEAT_IN_RENT ? ' Heat in rent assumes natural gas heat and $12,000 of yearly rent.' : ''}
          </p>
        )}
      </div>

      {!grids ? (
        <div className="flex min-h-[18rem] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white">
          <p className="text-gray-400 text-sm">Loading every state…</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm font-semibold text-gray-700 mb-1">
            Yearly regular payment by state
            <span className="text-gray-400 font-normal"> — same household, income and bill everywhere</span>
          </p>
          <div style={{ height: rows.length * 18 + 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  niceTicks="snap125"
                  domain={[0, (dataMax: number) => Math.max(500, Math.ceil(dataMax / 500) * 500)]}
                  tickFormatter={fmt}
                  tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  interval={0}
                  tick={{ fontFamily: 'var(--font-sans)', fontSize: 10, fill: 'var(--foreground)' }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--border)', opacity: 0.4 }}
                  contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}
                  separator=": "
                  formatter={(value, _name, item) => {
                    const row = item.payload as Row;
                    const note = row.aboveRange
                      ? ' (above the incomes run for this state)'
                      : row.benefit === 0 && row.eligible ? ' (eligible, no payment)' : '';
                    return [`${fmt(Number(value))}${note}`, 'Payment'];
                  }}
                />
                <Bar dataKey="benefit" isAnimationActive={false} barSize={11}>
                  {rows.map((row) => (
                    <Cell key={row.code} fill="var(--chart-1)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {none.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              No payment: {none.map((r) => r.name).join(', ')}.
            </p>
          )}
          {loaded && loaded.missing.length > 0 && (
            <p className="text-xs text-red-700 mt-2">
              No data file for: {loaded.missing.join(', ')}.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            Without a cooling cost and with each state&apos;s default housing choice. Michigan shows its Home
            Heating Credit. An income above the highest income run for a state is shown as no payment.
          </p>
        </div>
      )}
    </section>
  );
}

function Field({ label, children, grow, htmlFor }: { label: string; children: React.ReactNode; grow?: boolean; htmlFor?: string }) {
  return (
    <div className={grow ? 'flex-1 min-w-[9.5rem]' : 'min-w-[6.5rem]'}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
