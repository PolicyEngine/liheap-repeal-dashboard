export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-12" role="contentinfo">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-gray-500">
          Built by{' '}
          <a href="https://policyengine.org" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            PolicyEngine
          </a>
          . Powered by the{' '}
          <a href="https://github.com/PolicyEngine/policyengine-us" className="text-primary-600 hover:underline" target="_blank" rel="noopener noreferrer">
            policyengine-us
          </a>{' '}
          microsimulation model.
        </p>
      </div>
    </footer>
  );
}
