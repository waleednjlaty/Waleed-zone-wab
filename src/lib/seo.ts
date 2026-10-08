import type { Metadata } from 'next';
import { SITE_ARABIC_NAME, SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_NAME, SITE_URL } from '@/lib/site';
import type { Locale } from '@/lib/locale';

/** Each public page owns its social metadata as well as its canonical. */
export function pageMetadata(title: string, description: string, path: string, options: { absoluteTitle?: boolean; noindex?: boolean; locale?: Locale } = {}): Metadata {
  const locale = options.locale || 'ar';
  const socialTitle = options.absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: options.absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: { index: !options.noindex, follow: true },
    openGraph: { title: socialTitle, description, url: path === '/' ? SITE_URL : SITE_URL + path, type: 'website', siteName: SITE_NAME, locale: locale === 'en' ? 'en_US' : 'ar_SA' },
    twitter: { card: 'summary', title: socialTitle, description },
  };
}

export function websiteStructuredData(locale: Locale = 'ar') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: SITE_ARABIC_NAME,
    url: SITE_URL,
    inLanguage: locale,
    description: locale === 'en' ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION,
  };
}

export function breadcrumbStructuredData(items: { name: string; item: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })),
  };
}
