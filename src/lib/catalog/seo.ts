import type { Metadata } from 'next';
import { resolveDetail } from './resolve';
import { appName } from '@/components/catalog/presentation';
import { appHref } from './routes';
import { SITE_URL } from '@/lib/site';
import { safeExternalUrl } from '@/lib/utils';
export async function detailMetadata(slug:string,kind:'apps'|'games'):Promise<Metadata> {
  const app=await resolveDetail(slug,kind),name=appName(app),image=safeExternalUrl(app.imageUrl);
  const title=`${name}${app.version?` ${app.version}`:''} — ${kind==='games'?'تفاصيل اللعبة':'تفاصيل التطبيق'} والتحميل`;
  const description=(app.description||`تفاصيل ${name}${app.version?` إصدار ${app.version}`:''}${app.size?` بحجم ${app.size}`:''} في Waleed Zone.`).replace(/\s+/g,' ').slice(0,155);
  const canonical=appHref(app);
  return {title,description,alternates:{canonical},openGraph:{title,description,url:SITE_URL+canonical,type:'website',images:image?[{url:image,alt:name}]:[]},twitter:{card:'summary',title,description,images:image?[image]:[]}};
}
