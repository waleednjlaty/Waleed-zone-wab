import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { getAppById } from '@/lib/queries';
import { appHref, idFromSlug } from './routes';
export async function resolveDetail(slug:string,kind:'apps'|'games') {
  const id=idFromSlug(slug),app=id?await getAppById(id):undefined;
  if(!app)notFound();
  if(appHref(app)!==`/${kind}/${slug}`)permanentRedirect(appHref(app));
  return app;
}
