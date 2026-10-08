import { getLocale } from '@/lib/locale-server';
import type { Metadata } from 'next';
import { resolveDetail } from './resolve';
import { appName } from '@/components/catalog/presentation';
import { appHref } from './routes';
import { pageMetadata } from '@/lib/seo';
import { safeExternalUrl } from '@/lib/utils';
export async function detailMetadata(slug:string,kind:'apps'|'games'):Promise<Metadata> {
  const locale=await getLocale(), en=locale==='en';
  const app=await resolveDetail(slug,kind),name=appName(app,locale),image=safeExternalUrl(app.imageUrl);
  const known=(value:string|null)=>value?.trim()&&!/^[-–—.]+$/.test(value.trim())?value.trim():null;
  const version=known(app.version),size=known(app.size);
  const title=`${name}${version?` ${version}`:''} — ${en ? (kind==='games'?'Game details and download':'App details and download') : (kind==='games'?'تفاصيل اللعبة والتحميل':'تفاصيل التطبيق والتحميل')}`;
  // A reused catalog description must not make every app's metadata identical.
  const description=(en ? `Details for ${name}${version?` version ${version}`:''}${size?` (${size})`:''} on Waleed Zone. ${app.description||''}` : `تفاصيل ${name}${version?` إصدار ${version}`:''}${size?` بحجم ${size}`:''} في وليد زون. ${app.description||''}`).replace(/\s+/g,' ').trim().slice(0,160);
  const canonical=appHref(app);
  const metadata=pageMetadata(title,description,canonical,{locale});
  return {...metadata,openGraph:{...metadata.openGraph,images:image?[{url:image,alt:name}]:[]},twitter:{...metadata.twitter,images:image?[image]:[]}};
}
