import { enforceRouteAccess } from '@/lib/route-access';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { NavigationSkeleton } from '@/components/CatalogSkeleton';
import VisitorTracker from '@/components/VisitorTracker';
import { HOME_TITLE, HOME_TITLE_EN, SITE_NAME, SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_URL } from '@/lib/site';
import LocaleProvider from '@/components/LocaleProvider';
import { getLocale } from '@/lib/locale-server';
import { localeDirection } from '@/lib/locale';
import { ADSENSE_PUBLISHER_ID } from '@/lib/ads';

export const viewport: Viewport = {
  themeColor: '#0B0D10',
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const english = locale === 'en';
  const title = english ? HOME_TITLE_EN : HOME_TITLE;
  const description = english ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: '%s | ' + SITE_NAME,
    },
    description,
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
      locale: english ? 'en_US' : 'ar_SA',
      siteName: SITE_NAME,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    icons: {
      icon: '/wz-mark.svg',
      apple: '/wz-mark.svg',
    },
    category: 'technology',
    applicationName: SITE_NAME,
    ...(ADSENSE_PUBLISHER_ID ? { other: { 'google-adsense-account': ADSENSE_PUBLISHER_ID! } } : {}),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await enforceRouteAccess();
  const locale = await getLocale();
  const english = locale === 'en';
  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body className="flex min-h-screen flex-col">
        <LocaleProvider locale={locale}>
          <a href="#main-content" className="skip-link">{english ? 'Skip to content' : 'انتقل إلى المحتوى'}</a>
          <VisitorTracker />
          <Suspense fallback={<NavigationSkeleton />}><Navbar /></Suspense>
          <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
          <Footer />
        </LocaleProvider>
      </body>
    </html>
  );
}
