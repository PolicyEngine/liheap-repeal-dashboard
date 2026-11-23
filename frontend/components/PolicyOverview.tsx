'use client';

import { useEffect, useState } from 'react';
import { YEARS } from '@/lib/liheapGrid';

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  (process.env.NODE_ENV === 'production' ? '/liheap-repeal-dashboard' : '');

export default function PolicyOverview({ onTabChange }: { onTabChange?: (tab: string) => void }) {
  const [modelVersion, setModelVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_PATH}/data/liheap/${YEARS[0].value}/index.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((index) => setModelVersion(index?.model?.version ?? null))
      .catch(() => setModelVersion(null));
  }, []);

  return (
    <section className="space-y-6">
      {/* What is LIHEAP */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">What is LIHEAP?</h2>
        <p className="text-gray-700 leading-relaxed">
          The <strong>Low Income Home Energy Assistance Program (LIHEAP)</strong> is a federally
          funded program that helps low-income households pay their heating and cooling bills.
          The federal government distributes approximately <strong>$4 billion per year</strong> in
          block grants to states, which administer the program locally.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Eligibility is generally limited to households with income below <strong>60% of State
          Median Income</strong> or 150% of the Federal Poverty Level, whichever is greater.
          Benefits vary by state, household size, income, and heating fuel type.
        </p>
      </div>

      {/* How the calculator works */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold text-gray-900">How the calculator works</h2>
        <p className="text-gray-700 leading-relaxed">
          Choose a state, a household, an income and a heating source, and the calculator shows
          the regular LIHEAP payment that PolicyEngine&apos;s model computes, in
          <strong> all 50 states and DC</strong>. The charts show how the payment changes with
          income and household size for each heating source.
        </p>
        <ul className="list-disc ml-5 space-y-1.5 text-gray-600 text-sm">
          <li>
            Every amount is one run of the{' '}
            <a href="https://github.com/PolicyEngine/policyengine-us" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">policyengine-us</a>{' '}
            model{modelVersion ? ` (version ${modelVersion})` : ''} for that exact household, computed ahead of time.
            The calculator does not estimate between runs, so income moves in $500 steps and
            yearly bills in ten levels from $300 to $5,000.
          </li>
          <li>
            Adults are 40 and children are 10, and all income is one adult&apos;s wages. No one is 60 or
            older, under 6 or disabled; many states pay more to households with such a member.
          </li>
          <li>
            The model also works out the household&apos;s other benefits. Where a state counts cash
            assistance (TANF) or SSI as income, or accepts SNAP, TANF or SSI as proof of eligibility,
            the LIHEAP amount reflects it, so a payment can step up at the income where TANF ends.
          </li>
          <li>
            A home not heated with electricity also has a $1,500 yearly electric bill. Heat
            included in rent assumes natural gas heat and $12,000 of yearly rent.
          </li>
          <li>
            Where benefits vary by county, the state&apos;s most populous county is used. Alaska uses
            Anchorage.
          </li>
          <li>
            Seven states with a separate cooling benefit (Alabama, Arkansas, Georgia, Kentucky,
            Louisiana, Oklahoma and South Carolina) offer a &quot;Pays for cooling&quot; option. Nebraska,
            New Jersey and Virginia pay cooling only to households with an older, very young,
            disabled or medically certified member, so no cooling amount appears for them.
          </li>
          <li>
            Michigan shows its Home Heating Credit, the state&apos;s regular heating help. In Hawaii the
            model pays only households in subsidized housing for now, so amounts are $0.
          </li>
          <li>
            Amounts are regular heating and cooling payments. Crisis assistance, weatherization and
            equipment are not included, and actual benefits depend on funding and documentation.
          </li>
        </ul>
        <button
          onClick={() => onTabChange?.('calculator')}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-primary-300 hover:bg-primary-50 transition-colors mt-2"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <rect x="5" y="3" width="14" height="18" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h2m3 0h3M8 15h2m3 0h3M8 19h2m3 0h3" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Try the calculator</p>
            <p className="text-xs text-gray-500">Estimate your LIHEAP eligibility and benefit amount</p>
          </div>
        </button>
      </div>
    </section>
  );
}
