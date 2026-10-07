import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAppById } from '@/lib/queries';
import { idFromSlug, appHref } from '@/lib/catalog/routes';
import { permanentRedirect } from 'next/navigation';
/** Check before the root layout can stream. Data access and APIs still guard
 * independently; this is not a replacement for authorization next to data. */
export async function enforceRouteAccess() {
  const path=decodeURIComponent((await headers()).get('x-wz-route')||'');
  if(path==='/account' || path.startsWith('/account/')) {
    if(!await getCurrentUser())redirect('/login');
  }
  const detail=path.match(/^\/(apps|games)\/([^/]+)$/);
  if(detail) {
    // Warm the request cache before streaming. Missing details are handled by
    // their nested layout: Next.js forbids notFound() in the root layout.
    const id=idFromSlug(detail[2]),app=id?await getAppById(id):undefined;
    if(app && appHref(app)!==path)permanentRedirect(appHref(app));
  }
}
