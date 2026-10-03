import { headers } from 'next/headers';
import { safeJsonLd } from '@/lib/utils';

export default async function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" nonce={(await headers()).get('x-nonce') || undefined}
    dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
