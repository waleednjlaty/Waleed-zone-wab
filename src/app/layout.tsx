import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VisitorTracker from '@/components/VisitorTracker';
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

export const viewport: Viewport = {
  themeColor: '#070a0e',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME + ' — تحميل التطبيقات والألعاب',
    template: '%s | ' + SITE_NAME,
  },
  description: SITE_DESCRIPTION,
  keywords: ['تحميل تطبيقات', 'تحميل ألعاب', 'WALEED ZONE', 'أدوات مجانية', 'أندرويد', 'ويندوز'],
  verification: {
    google: 'WieAa828zHp-9pQGdlDCsAk9hWj1toB3ulo0Rh8v_bs',
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: SITE_NAME,
    title: SITE_NAME + ' — تحميل التطبيقات والألعاب',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME + ' — تحميل التطبيقات والألعاب',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/icon.svg',
  },
  category: 'technology',
  applicationName: SITE_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: SITE_NAME,
              url: SITE_URL,
              inLanguage: 'ar',
              description: SITE_DESCRIPTION,
            }),
          }}
        />
        <VisitorTracker />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
