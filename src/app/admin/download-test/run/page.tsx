import { requireOwner } from '@/lib/authorization';
import { getLocale } from '@/lib/locale-server';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import LegacyDownloadExperience from '@/components/download/LegacyDownloadExperience';
import { getFallbackDelivery } from '@/components/download/presentation';
import { getAppById } from '@/lib/queries';
import { notFound } from 'next/navigation';

export const dynamic='force-dynamic';
export const metadata={title:'Owner provider diagnostics | Waleed Zone',robots:{index:false,follow:false},referrer:'no-referrer'};

/** Owner-only diagnostic entry point: public SteamRIP downloads always go to
 * Telegram. Keep existing countdown, token and CDN QA available to the owner
 * without exposing website-based provider extraction to ordinary visitors. */
export default async function OwnerProviderDiagnostic({searchParams}:{
  searchParams:Promise<{application_id?:string}>
}) {
  await requireOwner();
  const params=await searchParams,id=params.application_id||'';
  if(!/^[1-9][0-9]{0,9}$/.test(id)||Number(id)>2147483647)notFound();
  const app=await getAppById(Number(id));if(!app)notFound();
  const provider=await getFallbackDelivery(app.id);
  if(provider!=='steamrip')notFound();
  const locale=await getLocale();
  return <LegacyDownloadExperience app={{
    id:app.id,name:appName(app,locale),imageUrl:app.imageUrl,
    detailHref:appHref(app),version:app.version,size:app.size,
  }} provider="steamrip"/>;
}
