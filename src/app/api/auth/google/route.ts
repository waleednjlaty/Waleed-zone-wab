import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
const STATE_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-wz_google_state' : 'wz_google_state';
const STATE_TTL = 10 * 60;

function clearState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?google=not_configured', SITE_URL));
  }

  const state = randomBytes(32).toString('base64url');
  const callback = new URL('/api/auth/google/callback', SITE_URL);
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', callback.toString());
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
