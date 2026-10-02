import { enforceRouteAccess } from '@/lib/route-access';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import Script from 'next/script';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { NavigationSkeleton } from '@/components/CatalogSkeleton';
import VisitorTracker from '@/components/VisitorTracker';
import { HOME_TITLE, SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';
import { ADSENSE_PUBLISHER_ID, ADSENSE_READY } from '@/lib/ads';

export const viewport: Viewport = {
  themeColor: '#0B0D10',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: HOME_TITLE,
    template: '%s | ' + SITE_NAME,
  },
  description: SITE_DESCRIPTION,
  verification: {
    google: 'WieAa828zHp-9pQGdlDCsAk9hWj1toB3ulo0Rh8v_bs',
    other: {
      ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
        ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
        : {}),
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: HOME_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: '/wz-mark.svg',
    apple: '/wz-mark.svg',
  },
  category: 'technology',
  applicationName: SITE_NAME,
  ...(ADSENSE_READY ? { other: { 'google-adsense-account': ADSENSE_PUBLISHER_ID! } } : {}),
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await enforceRouteAccess();
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen flex-col">
        <a href="#main-content" className="skip-link">انتقل إلى المحتوى</a>
        <VisitorTracker />
        {ADSENSE_READY && <Script async strategy="afterInteractive" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}`} crossOrigin="anonymous" />}
        <Suspense fallback={<NavigationSkeleton />}><Navbar /></Suspense>
        <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
