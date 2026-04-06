'use client';

import Header from '@/components/Header';
import PolicyOverview from '@/components/PolicyOverview';
import AggregateImpact from '@/components/AggregateImpact';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-12">
        <PolicyOverview />
        <AggregateImpact />
      </main>
      <Footer />
    </div>
  );
}
