import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CoverImage from '@/components/CoverImage';
import { getAppById,getRelatedApps } from '@/lib/queries';
import { SITE_NAME,SITE_URL,telegramDownloadUrl } from '@/lib/site';
import { formatDate,safeExternalUrl,safeJsonLd } from '@/lib/utils';
export const dynamic='force-dynamic';
interface Props { params:Promise<{id:string}>; }
function idFrom(value:string) { if(!/^\d{1,10}$/.test(value)) return null; const id=Number(value); return Number.isSafeInteger(id)&&id>0?id:null; }
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const id=idFrom((await params).id), app=id ? await getAppById(id):undefined;
  if(!app) notFound();
  const name=app.name||`تطبيق ${app.id}`, description=(app.description||`معلومات وتحميل ${name} عبر وليد زون`).replace(/\s+/g,' ').slice(0,155);
  const title=`${name}${app.version ? ` ${app.version}`:''} — التفاصيل والتحميل`;
  const image=safeExternalUrl(app.imageUrl);
  return {title,description,alternates:{canonical:`/app/${app.id}`},openGraph:{title,description,url:`${SITE_URL}/app/${app.id}`,type:'website',images:image?[{url:image,alt:name}]:[]},twitter:{card:'summary_large_image',title,description,images:image?[image]:[]}};
}
export default async function AppPage({params}:Props) {
  const id=idFrom((await params).id); if(!id) notFound();
  const app=await getAppById(id); if(!app) notFound();
  const related=await getRelatedApps(app.id,app.category,4), name=app.name||`تطبيق ${app.id}`;
  const direct=safeExternalUrl(app.downloadUrl), url=`${SITE_URL}/app/${app.id}`;
  const categoryPath=app.category?`/category/${encodeURIComponent(app.category)}`:undefined;
  const data={'@context':'https://schema.org','@type':'SoftwareApplication',name,description:app.description,url,image:safeExternalUrl(app.imageUrl),applicationCategory:app.category,operatingSystem:app.platform,softwareVersion:app.version,datePublished:app.createdAt,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}};
  return <div className="shell py-8 sm:py-12"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(data)}}/>
    <nav aria-label="مسار التنقل" className="mb-7 flex flex-wrap gap-2 text-sm text-[#667577]"><Link href="/" className="hover:text-[#b95736]">الرئيسية</Link><span>/</span>{categoryPath&&<><Link href={categoryPath} className="hover:text-[#b95736]">{app.category}</Link><span>/</span></>}<span className="text-[#142426]">{name}</span></nav>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"><article className="surface overflow-hidden"><CoverImage src={app.imageUrl} alt={name} aspectClassName="aspect-[16/8]"/><div className="p-6 sm:p-9"><p className="eyebrow">DETAILS / {app.category||'مكتبة التطبيقات'}</p><h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{name}</h1>
      <div className="mt-5 flex flex-wrap gap-2">{[app.category,app.platform,app.version,app.size].filter(Boolean).map((v,i)=><span key={i} className="rounded-full bg-[#edf2ee] px-3 py-1.5 text-xs font-bold text-[#46615a]">{v}</span>)}</div>
      <div className="mt-9 border-t border-[#e5ebe7] pt-7"><h2 className="text-xl font-black">عن هذا المحتوى</h2><p className="mt-4 whitespace-pre-line break-words text-[15px] leading-8 text-[#526461]">{app.description||'لا يتوفر وصف إضافي لهذا المحتوى حاليًا.'}</p></div>
      <div className="mt-9 border-t border-[#e5ebe7] pt-7"><h2 className="text-xl font-black">معلومات الملف</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2">{[['الإصدار',app.version],['الحجم',app.size],['المنصة',app.platform],['الفئة',app.category],['المطور',app.developer],['تاريخ الإضافة',formatDate(app.createdAt)]].map(([label,value])=><div key={label} className="rounded-xl bg-[#f4f7f4] p-4"><dt className="text-xs text-[#667577]">{label}</dt><dd className="mt-1 break-words text-sm font-bold">{value||'غير متوفر'}</dd></div>)}</dl></div>
    </div></article><aside className="surface p-6 lg:sticky lg:top-24"><p className="eyebrow">DOWNLOAD OPTIONS</p><h2 className="mt-2 text-xl font-black">حمّل {name}</h2><p className="mt-3 text-sm leading-7 text-[#667577]">اختر البوت للحصول على الملف، أو افتح الرابط الخارجي إن كان متوفرًا.</p><div className="mt-6 grid gap-3"><a className="primary-action" href={telegramDownloadUrl(app.id)} target="_blank" rel="noopener noreferrer">تحميل عبر البوت ↗</a>{direct&&<a className="secondary-action" href={direct} target="_blank" rel="noopener noreferrer nofollow">فتح رابط التحميل الخارجي ↗</a>}</div><p className="mt-6 border-t border-[#e5ebe7] pt-5 text-xs leading-6 text-[#667577]">تحقق من المصدر والإصدار وصلاحيات الملف قبل التثبيت، خاصةً للنسخ المعدلة.</p></aside></div>
    {related.length>0&&<section className="mt-16"><p className="eyebrow">KEEP EXPLORING</p><h2 className="mb-6 mt-2 text-2xl font-black">قد يعجبك أيضًا</h2><AppGrid apps={related}/></section>}
  </div>;
}
