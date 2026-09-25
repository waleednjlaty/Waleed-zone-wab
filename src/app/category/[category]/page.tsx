import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import Pagination from '@/components/Pagination';
import { getApps, getCategories } from '@/lib/queries';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { parsePage } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface CategoryPageProps {
  params: { category: string };
  searchParams: { page?: string | string[] };
}

function decodeCategory(value: string): string {
  try {
    return decodeURIComponent(value).trim().slice(0, 100);
  } catch {
    return '';
  }
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = decodeCategory(params.category);
  if (!category) return { title: 'الفئة غير موجودة', robots: { index: false, follow: true } };

  const title = category + ' — تحميل أحدث التطبيقات والألعاب';
  const description = 'تصفح وتحميل أحدث محتوى ' + category + ' من ' + SITE_NAME + ' مع معلومات الإصدار والحجم والمنصة وروابط التحميل.';

  return {
    title,
    description,
    alternates: { canonical: '/category/' + encodeURIComponent(category) },
    openGraph: { title, description, url: SITE_URL + '/category/' + encodeURIComponent(category), type: 'website' },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const category = decodeCategory(params.category);
  if (!category) notFound();

  const categories = await getCategories();
  const canonicalCategory = categories.find((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase());
  if (!canonicalCategory) notFound();

  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = parsePage(rawPage);
  const { items, total, totalPages, currentPage } = await getApps({ category: canonicalCategory, page, limit: 12 });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: canonicalCategory + ' | ' + SITE_NAME,
    url: SITE_URL + '/category/' + encodeURIComponent(canonicalCategory),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: items.map((app, index) => ({
        '@type': 'ListItem',
        position: (currentPage - 1) * 12 + index + 1,
        url: SITE_URL + '/app/' + app.id,
        name: app.name ?? 'تطبيق ' + app.id,
      })),
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="مسار التنقل" className="mb-6 flex items-center gap-2 text-xs font-bold text-slate-600">
        <Link href="/" className="transition hover:text-cyan-300">المكتبة</Link>
        <span>/</span>
        <span className="text-slate-400">{canonicalCategory}</span>
      </nav>

      <header className="mb-8 border-b border-white/[0.06] pb-7">
        <p className="kicker text-[10px] font-black uppercase">CATEGORY</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {canonicalCategory}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          تصفح أحدث {canonicalCategory} المتوفرة في {SITE_NAME}. كل تطبيق إله صفحة مستقلة بمعلوماته ورابط التحميل.
        </p>
        <p className="mt-4 text-xs font-bold text-slate-600">{total} عنصر متوفر</p>
      </header>

      {items.length > 0 ? <AppGrid apps={items} /> : <p className="text-sm text-slate-500">لا يوجد محتوى منشور في هذه الفئة حاليًا.</p>}

      <div className="mt-12">
        <Pagination currentPage={currentPage} totalPages={totalPages} category={canonicalCategory} />
      </div>
    </div>
  );
}
