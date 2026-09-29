import { ADSENSE_PUBLISHER_ID, ADSENSE_READY } from '@/lib/ads';

export function GET() {
  if (!ADSENSE_READY || !ADSENSE_PUBLISHER_ID) return new Response('Not found', { status: 404 });
  return new Response(`google.com, ${ADSENSE_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
