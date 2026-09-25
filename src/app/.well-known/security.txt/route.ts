import { SITE_URL, TELEGRAM_BOT_URL } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const body = [
    'Contact: ' + TELEGRAM_BOT_URL,
    'Expires: 2027-09-25T00:00:00.000Z',
    'Preferred-Languages: ar, en',
    'Canonical: ' + SITE_URL + '/.well-known/security.txt',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
