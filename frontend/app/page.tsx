'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import PolicyOverview from '@/components/PolicyOverview';
import HouseholdCalculator from '@/components/HouseholdCalculator';
import Footer from '@/components/Footer';

const TABS = [
  { key: 'overview', label: 'How it works' },
  { key: 'calculator', label: 'Household calculator' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-8">
        <div className={activeTab === 'calculator' ? 'max-w-7xl mx-auto' : 'max-w-5xl mx-auto'}>
          {/* Tab navigation */}
          <div className="flex gap-2 mb-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-primary-800 border-2 border-primary-500 shadow-sm'
                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && <PolicyOverview onTabChange={(tab) => setActiveTab(tab as TabKey)} />}
          {activeTab === 'calculator' && <HouseholdCalculator />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
