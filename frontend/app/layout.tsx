import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LIHEAP Benefit Calculator',
  description:
    'Estimate your LIHEAP eligibility and benefit amount for DC, Massachusetts, and Illinois.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
