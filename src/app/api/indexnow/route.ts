import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { submitIndexNow } from '@/lib/indexnow';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.INDEXNOW_ADMIN_TOKEN || process.env.WEBSITE_STATS_TOKEN;
  const authorization = request.headers.get('authorization');
  if (!expected || !authorization?.startsWith('Bearer ')) return false;

  const provided = Buffer.from(authorization.slice(7));
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const urls =
    typeof body === 'object' &&
    body !== null &&
    'urls' in body &&
    Array.isArray((body as { urls?: unknown }).urls)
      ? (body as { urls: unknown[] }).urls.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];

  if (urls.length === 0 || urls.length > 10000) {
    return NextResponse.json(
      { error: 'Provide between 1 and 10000 URL strings.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await submitIndexNow(urls);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('IndexNow submission failed', error);
    return NextResponse.json(
      { error: 'IndexNow submission failed' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
