import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

const GA_ID = 'G-91M4529HE7';
const TOOL_NAME = 'liheap-repeal-dashboard';

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
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { tool_name: '${TOOL_NAME}' });
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
