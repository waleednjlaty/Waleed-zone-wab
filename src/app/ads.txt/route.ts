import { adsTxt } from '@/lib/ads';
export const dynamic = 'force-dynamic';
export function GET() {
  const body = adsTxt();
  return new Response(body ?? 'Not found', { status: body ? 200 : 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': body ? 'public, max-age=300' : 'no-store' } });
}
