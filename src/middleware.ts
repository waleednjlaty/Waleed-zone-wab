import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from '@/lib/security/csp';
/** File exposure defense only. Authorization lives next to server data access. */
export function middleware(request:NextRequest) {
  let path=request.nextUrl.pathname;
  try { path=decodeURIComponent(path); } catch { return new NextResponse('Not found',{status:404}); }
  if(/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.svn|\.hg|node_modules|backups?|logs?|tmp|temp)(?:\/|$)/i.test(path)
    || /\.(?:sql|sqlite|db|bak|backup|log|pem|key|map)$/i.test(path)
    || /(?:^|\/)(?:next\.config\.[^/]+|package-lock\.json|tsconfig\.json)$/i.test(path)) {
    return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  }
  const requestHeaders=new Headers(request.headers);
  // Overwrite incoming values; clients cannot spoof the route guard context.
  requestHeaders.set('x-wz-route',encodeURIComponent(path));
  const nonce=btoa(crypto.randomUUID());
  const csp=contentSecurityPolicy(nonce,process.env,path.startsWith('/download/')||path==='/api/downloads/legacy/redeem');
  requestHeaders.set('x-nonce',nonce);
  requestHeaders.set('Content-Security-Policy',csp);
  const response=NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set('Content-Security-Policy',csp);
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
