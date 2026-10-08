import { headers } from 'next/headers';
import { safeJsonLd } from '@/lib/utils';

export default async function JsonLd({ data }: { data: unknown }) {
  // Browsers hide nonce attributes after parsing; keep the real nonce and CSP intact.
  return <script suppressHydrationWarning type="application/ld+json" nonce={(await headers()).get('x-nonce') || undefined}
    dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
