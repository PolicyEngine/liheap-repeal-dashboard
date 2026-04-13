export default function Header() {
  return (
    <header className="bg-gradient-to-r from-primary-700 via-primary-600 to-primary-500 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 pt-10">
        <h1 className="text-3xl sm:text-4xl font-bold">LIHEAP Benefit Calculator</h1>
        <p className="mt-2 text-white/80 text-lg">
          Estimate your LIHEAP eligibility and benefit amount for DC, Massachusetts, and Illinois
        </p>
      </div>
    </header>
  );
}
