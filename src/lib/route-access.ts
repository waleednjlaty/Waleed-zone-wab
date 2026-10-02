import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { resolveDetail } from '@/lib/catalog/resolve';
/** Check before the root layout can stream. Data access and APIs still guard
 * independently; this is not a replacement for authorization next to data. */
export async function enforceRouteAccess() {
  const path=decodeURIComponent((await headers()).get('x-wz-route')||'');
  if(path==='/account' || path.startsWith('/account/')) {
    if(!await getCurrentUser())redirect('/login');
  }
  const detail=path.match(/^\/(apps|games)\/([^/]+)$/);
  if(detail)await resolveDetail(detail[2],detail[1] as 'apps'|'games');
}
