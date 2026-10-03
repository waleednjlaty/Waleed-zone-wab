import JsonLd from '@/components/JsonLd';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import Pagination from '@/components/Pagination';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { getApps, getCategories } from '@/lib/queries';
import { breadcrumbStructuredData, pageMetadata } from '@/lib/seo';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { parsePage } from '@/lib/utils';

export const dynamic = 'force-dynamic';
interface Props { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string | string[] }> }
function decode(value: string) { try { return decodeURIComponent(value).trim().slice(0, 100); } catch { return ''; } }

const categoryContent = cache(async (value: string, page: number) => {
  const category = decode(value), categories = await getCategories();
  const canonical = categories.find(item => item.toLocaleLowerCase() === category.toLocaleLowerCase());
  if (!canonical) notFound();
  const path = `/category/${encodeURIComponent(canonical)}`;
  const url = page > 1 ? `${path}?page=${page}` : path;
  if (canonical !== category) permanentRedirect(url);
  const result = await getApps({ category: canonical, page, limit: 12 });
  if (page > result.totalPages) notFound();
  return { category: canonical, categories, path, url, result };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams)?.page);
  const { category, url, result } = await categoryContent((await params).category, page);
  const suffix = page > 1 ? ` — صفحة ${page}` : '';
  return pageMetadata(`${category} — تطبيقات وألعاب${suffix}`, `تصفح ${category} في وليد زون. تفاصيل الإصدارات والمنصات وروابط التحميل لكل عنصر.${suffix}`, url, { noindex: result.total === 0 });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const page = parsePage((await searchParams)?.page);
  const { category, categories, path, url, result } = await categoryContent((await params).category, page);
  const data = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${category} | ${SITE_NAME}`, url: SITE_URL + url,
    mainEntity: { '@type': 'ItemList', numberOfItems: result.items.length, itemListElement: result.items.map((app, index) => ({
      '@type': 'ListItem', position: index + 1, url: SITE_URL + appHref(app), name: appName(app),
    })) },
  }, breadcrumbStructuredData([{ name: 'الرئيسية', item: SITE_URL }, { name: category, item: SITE_URL + url }])];
  return <div className="shell py-9 sm:py-14">
    <JsonLd data={data} />
    <nav aria-label="مسار التنقل" className="mb-7 text-sm text-[#a6b5b8]"><Link href="/" className="hover:text-[#d9f578]">الرئيسية</Link> / <span aria-current="page">{category}</span></nav>
    <header className="hero-pattern mb-10 overflow-hidden rounded-[30px] border border-white/10 bg-[#142029] p-8 sm:p-12">
      <p className="eyebrow">CATEGORY / {category}</p><h1 className="mt-4 text-4xl font-black sm:text-5xl">{category}<span className="text-[#d9f578]">.</span></h1>
      <p className="mt-4 max-w-2xl leading-8 text-[#a6b5b8]">كل {category} المتاحة في المكتبة، مع معلومات كل إصدار وخيارات التحميل.</p>
      <span className="mt-5 inline-block rounded-full bg-[#d9f578] px-4 py-2 text-xs font-black text-[#142029]">{result.total} عنصر{page > 1 ? ` · صفحة ${page}` : ''}</span>
    </header>
    <CategoryPills categories={categories} active={category} />
    <div className="mt-8">{result.items.length ? <AppGrid apps={result.items} /> : <p className="surface p-10 text-[#a6b5b8]">لا توجد عناصر منشورة في هذه الفئة.</p>}</div>
    <div className="mt-10"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} basePath={path} /></div>
  </div>;
}
