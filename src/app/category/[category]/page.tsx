import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import Pagination from '@/components/Pagination';
import { getApps,getCategories } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';
import { parsePage,safeJsonLd } from '@/lib/utils';
export const dynamic='force-dynamic';
interface Props { params:Promise<{category:string}>;searchParams:Promise<{page?:string|string[]}>; }
function decode(value:string) { try { return decodeURIComponent(value).trim().slice(0,100); } catch { return ''; } }
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata> {
  const category=decode((await params).category);
  const categories=await getCategories();
  if(!category || !categories.includes(category)) notFound();
  const page=parsePage((await searchParams)?.page), path=`/category/${encodeURIComponent(category)}`, canonical=page>1?`${path}?page=${page}`:path;
  const title=`${category} — تطبيقات وألعاب${page>1?` | صفحة ${page}`:''}`,description=`تصفح ${category} في وليد زون. تفاصيل الإصدارات والمنصات وروابط التحميل لكل عنصر.`;
  return {title,description,alternates:{canonical},openGraph:{title,description,url:SITE_URL+canonical,type:'website'}};
}
export default async function CategoryPage({params,searchParams}:Props) {
  const category=decode((await params).category), categories=await getCategories(), canonical=categories.find(x=>x.toLocaleLowerCase()===category.toLocaleLowerCase()); if(!canonical) notFound();
  const page=parsePage((await searchParams)?.page), result=await getApps({category:canonical,page,limit:12}); if(page>result.totalPages) notFound();
  const path=`/category/${encodeURIComponent(canonical)}`;
  const data={'@context':'https://schema.org','@type':'CollectionPage',name:`${canonical} | WALEED ZONE`,url:SITE_URL+path,mainEntity:{'@type':'ItemList',numberOfItems:result.total,itemListElement:result.items.map((app,i)=>({'@type':'ListItem',position:(result.currentPage-1)*12+i+1,url:`${SITE_URL}/app/${app.id}`,name:app.name||`تطبيق ${app.id}`}))}};
  return <div className="shell py-9 sm:py-14"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(data)}}/><nav aria-label="مسار التنقل" className="mb-7 text-sm text-[#667577]"><Link href="/" className="hover:text-[#b95736]">الرئيسية</Link> / {canonical}</nav>
    <header className="mb-10 rounded-[28px] bg-[#173b3b] p-8 text-white sm:p-12"><p className="text-xs font-bold text-[#f3aa83]">CATEGORY / {canonical}</p><h1 className="mt-3 text-4xl font-black">{canonical}</h1><p className="mt-4 max-w-2xl leading-8 text-[#c2d7d0]">اكتشف {canonical} المتاحة في المكتبة، وشاهد التفاصيل والإصدار وخيارات التحميل لكل عنصر.</p><span className="mt-5 inline-block rounded-full bg-white/10 px-4 py-2 text-xs font-bold">{result.total} عنصر</span></header>
    <CategoryPills categories={categories} active={canonical}/><div className="mt-8">{result.items.length?<AppGrid apps={result.items}/>:<p className="surface p-10 text-[#667577]">لا توجد عناصر منشورة في هذه الفئة.</p>}</div><div className="mt-10"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} basePath={path}/></div>
  </div>;
}
