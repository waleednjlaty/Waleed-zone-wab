import type { Metadata } from 'next';
import { resolveDetail } from './resolve';
import { appName } from '@/components/catalog/presentation';
import { appHref } from './routes';
import { pageMetadata } from '@/lib/seo';
import { safeExternalUrl } from '@/lib/utils';
export async function detailMetadata(slug:string,kind:'apps'|'games'):Promise<Metadata> {
  const app=await resolveDetail(slug,kind),name=appName(app),image=safeExternalUrl(app.imageUrl);
  const known=(value:string|null)=>value?.trim()&&!/^[-–—.]+$/.test(value.trim())?value.trim():null;
  const version=known(app.version),size=known(app.size);
  const title=`${name}${version?` ${version}`:''} — ${kind==='games'?'تفاصيل اللعبة':'تفاصيل التطبيق'} والتحميل`;
  // A reused catalog description must not make every app's metadata identical.
  const description=(`تفاصيل ${name}${version?` إصدار ${version}`:''}${size?` بحجم ${size}`:''} في وليد زون. ${app.description||''}`).replace(/\s+/g,' ').trim().slice(0,160);
  const canonical=appHref(app);
  const metadata=pageMetadata(title,description,canonical);
  return {...metadata,openGraph:{...metadata.openGraph,images:image?[{url:image,alt:name}]:[]},twitter:{...metadata.twitter,images:image?[image]:[]}};
}
