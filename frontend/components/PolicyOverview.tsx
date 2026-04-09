export default function PolicyOverview() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">
        What is LIHEAP?
      </h2>
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
      <p className="text-gray-700 leading-relaxed">
        This dashboard estimates the impact of <strong>fully repealing federal LIHEAP funding</strong> on
        households in Washington DC, Massachusetts, and Illinois — the three states where
        PolicyEngine has detailed LIHEAP modeling. The analysis uses CPS/SPM self-reported
        energy assistance data, which captures actual LIHEAP receipt in the survey.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-1">DC FY2024 Heating Spending</p>
          <p className="text-xl font-bold text-gray-900">$7.7M</p>
          <p className="text-xs text-gray-400">6,891 heating HH served (FY24)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-1">MA FY2024 Heating Spending</p>
          <p className="text-xl font-bold text-gray-900">$124.4M</p>
          <p className="text-xs text-gray-400">150,047 heating HH served (FY24)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-1">IL FY2024 Heating Spending</p>
          <p className="text-xl font-bold text-gray-900">$127.5M</p>
          <p className="text-xs text-gray-400">205,143 heating HH served (FY24)</p>
        </div>
      </div>
    </section>
  );
}
