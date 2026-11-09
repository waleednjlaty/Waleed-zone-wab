import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/security/csp';

function unauthorizedPreview() {
  return new NextResponse('Preview access required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Waleed Zone private preview", charset="UTF-8"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

/** File exposure defense only. Authorization lives next to server data access. */
export function middleware(request: NextRequest) {
  // A separate Railway preview service sets these values. Production does not,
  // so the live website keeps its existing access behavior.
  if (process.env.WZ_PREVIEW_AUTH === 'true') {
    const expectedUser = process.env.WZ_PREVIEW_USER || '';
    const expectedPassword = process.env.WZ_PREVIEW_PASSWORD || '';
    if (!expectedUser || !expectedPassword) {
      return new NextResponse('Preview authentication is not configured', {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Basic ')) return unauthorizedPreview();
    try {
      const decoded = atob(authorization.slice(6));
      const separator = decoded.indexOf(':');
      const user = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      if (separator < 0 || !safeEqual(user, expectedUser) || !safeEqual(password, expectedPassword)) {
        return unauthorizedPreview();
      }
    } catch {
      return unauthorizedPreview();
    }
  }

  // Keep the Railway-generated URL working, but make the custom domain canonical.
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (host === 'waleed-zone.up.railway.app') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.waleedzone.xyz';
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url, 301);
  }

  let path = request.nextUrl.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  if (
    /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.svn|\.hg|node_modules|backups?|logs?|tmp|temp)(?:\/|$)/i.test(path) ||
    /\.(?:sql|sqlite|db|bak|backup|log|pem|key|map)$/i.test(path) ||
    /(?:^|\/)(?:next\.config\.[^/]+|package-lock\.json|tsconfig\.json)$/i.test(path)
  ) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-wz-route', encodeURIComponent(path));
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(
    nonce,
    process.env,
    path.startsWith('/download/') || path === '/api/downloads/legacy/redeem',
    path,
  );
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
