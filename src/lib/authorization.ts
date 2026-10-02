import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { notFound } from 'next/navigation';
import { getCurrentUser, type SiteUser } from '@/lib/auth';

/** A stable server-configured user ID. Registration cannot grant ownership. */
export function isOwner(user:SiteUser|null):boolean {
  const ownerId=process.env.OWNER_USER_ID?.trim();
  return Boolean(ownerId && user && user.id===ownerId);
}
export async function requireOwner():Promise<SiteUser> {
  const user=await getCurrentUser();
  if(!user||!isOwner(user))notFound();
  return user;
}
export async function authorizeOwnerRequest(request:Request,allowStatsToken=false):Promise<401|403|null> {
  const user=await getCurrentUser();
  if(isOwner(user))return null;
  // Preserve the existing owner automation credential, scoped to statistics only.
  const token=allowStatsToken?process.env.WEBSITE_STATS_TOKEN:undefined;
  const supplied=Buffer.from(request.headers.get('authorization')||'');
  const expected=Buffer.from(token?`Bearer ${token}`:'');
  if(token && supplied.length===expected.length && timingSafeEqual(supplied,expected))return null;
  return user?403:401;
}
