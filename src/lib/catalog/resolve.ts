import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { getAppById } from '@/lib/queries';
import { appHref, idFromSlug } from './routes';
export async function resolveDetail(slug:string,kind:'apps'|'games') {
  // Next route params can arrive decoded or percent-encoded. Compare decoded
  // paths, but only send the canonical URL as ASCII in an HTTP Location header.
  try { slug=decodeURIComponent(slug); } catch { notFound(); }
  const id=idFromSlug(slug),app=id?await getAppById(id):undefined;
  if(!app)notFound();
  if(appHref(app)!==`/${kind}/${slug}`)permanentRedirect(encodeURI(appHref(app)));
  return app;
}
