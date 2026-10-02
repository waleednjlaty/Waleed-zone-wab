import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Crawlable utility/API/download URLs expose noindex in metadata/headers.
        // Blocking them here would prevent Google from seeing that directive.
        disallow: ['/account', '/users', '/admin', '/dashboard', '/settings', '/database', '/debug', '/logs', '/uploads', '/private', '/manage', '/management'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
