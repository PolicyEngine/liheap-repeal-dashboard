export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-gray-500">
          Built by{' '}
          <a href="https://policyengine.org" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            PolicyEngine
          </a>
          . Data from CPS/SPM self-reported energy assistance. Sources:{' '}
          <a href="https://liheapch.acf.gov" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            LIHEAP Clearinghouse
          </a>
          ,{' '}
          <a href="https://github.com/PolicyEngine/policyengine-us" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            policyengine-us
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
