import { randomUUID, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site';
import { allowAttempt, authDb, createSession, ensureAuthTables, hashPassword, normalizedEmail, validEmail } from '@/lib/auth';

export const runtime = 'nodejs';
const STATE_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-wz_google_state' : 'wz_google_state';

function finish(path: string, clearState = true) {
  const response = NextResponse.redirect(new URL(path, SITE_URL));
  if (clearState) response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');
  const cookieState = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(STATE_COOKIE + '='))?.slice(STATE_COOKIE.length + 1);
  if (providerError) return finish('/login?google=cancelled');
  if (!code || !state || !cookieState || state.length > 256 || state !== decodeURIComponent(cookieState)) {
    return finish('/login?google=invalid_state');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return finish('/login?google=not_configured');

  try {
    const callback = new URL('/api/auth/google/callback', SITE_URL).toString();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callback,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenResponse.ok) return finish('/login?google=failed');
    const tokenData: unknown = await tokenResponse.json();
    if (!tokenData || typeof tokenData !== 'object' || !('id_token' in tokenData) || typeof tokenData.id_token !== 'string') {
      return finish('/login?google=failed');
    }

    // Google's tokeninfo endpoint validates the OIDC token signature, issuer, expiry and audience.
    const identityResponse = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokenData.id_token), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!identityResponse.ok) return finish('/login?google=failed');
    const identity: unknown = await identityResponse.json();
    if (!identity || typeof identity !== 'object') return finish('/login?google=failed');
    const profile = identity as Record<string, unknown>;
    const issuer = profile.iss;
    const audience = profile.aud;
    const email = normalizedEmail(profile.email);
    const name = typeof profile.name === 'string' ? profile.name.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 60) : '';
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
    const expiry = Number(profile.exp);
    if (
      audience !== clientId ||
      (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') ||
      !Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000) ||
      !emailVerified || !validEmail(email) || name.length < 1
    ) return finish('/login?google=unverified');

    await ensureAuthTables();
    const sql = authDb();
    if (!await allowAttempt(request, 'google_login', email, 8, 900)) return finish('/login?google=rate_limited');

    // The existing schema requires password_hash. Google-only accounts receive a
    // deliberately non-verifiable value, so password login cannot authenticate them.
    const unusablePasswordHash = 'google$' + randomBytes(32).toString('hex');
    const id = randomUUID();
    const rows = await sql`
      INSERT INTO site_users (id, name, email, password_hash)
      VALUES (${id}, ${name}, ${email}, ${unusablePasswordHash})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `;
    const userId = String(rows[0]?.id || '');
    if (!userId) return finish('/login?google=failed');
    await createSession(userId);
    return finish('/account?google=success');
  } catch {
    return finish('/login?google=failed');
  }
}
