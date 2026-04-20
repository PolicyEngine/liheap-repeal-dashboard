export default function PolicyOverview({ onTabChange }: { onTabChange?: (tab: string) => void }) {
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
          Enter your household details — state, income, household size, and heating source — and this
          tool estimates your LIHEAP eligibility and benefit amount. It currently covers
          <strong> Washington DC</strong>, <strong>Massachusetts</strong>, and <strong>Illinois</strong>,
          the three states where PolicyEngine has detailed LIHEAP payment models.
        </p>
        <ul className="list-disc ml-5 space-y-1.5 text-gray-600 text-sm">
          <li>Calculations run against the <a href="https://policyengine.org" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">PolicyEngine API</a>, which models each state&apos;s specific payment schedule and eligibility rules.</li>
          <li>Benefits are based on heating fuel type, household size, and income relative to state thresholds.</li>
          <li>Results are estimates — actual benefits may differ due to administrative factors, funding availability, and documentation requirements.</li>
        </ul>
        <button
          onClick={() => onTabChange?.('calculator')}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-primary-300 hover:bg-primary-50 transition-colors mt-2"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008z" />
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
