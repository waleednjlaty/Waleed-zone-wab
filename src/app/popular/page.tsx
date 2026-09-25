import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import Pagination from '@/components/Pagination';
import { getApps, getCategories } from '@/lib/queries';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { parsePage } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface PopularPageProps {
  searchParams: { page?: string | string[] };
}

export function generateMetadata({ searchParams }: PopularPageProps): Metadata {
  const page = parsePage(searchParams.page);
  const canonical = page > 1 ? '/popular?page=' + page : '/popular';

  return {
    title: 'الأكثر تحميلًا — تطبيقات وألعاب' + (page > 1 ? ' — الصفحة ' + page : ''),
    description:
      'تصفح التطبيقات والألعاب الأكثر تحميلًا على WALEED ZONE مع معلومات الإصدار والحجم والمنصة.',
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE_NAME,
      title: 'الأكثر تحميلًا على WALEED ZONE',
      description: 'أكثر التطبيقات والألعاب تحميلًا في مكتبة WALEED ZONE.',
      url: SITE_URL + canonical,
    },
  };
}

export default async function PopularPage({ searchParams }: PopularPageProps) {
  const page = parsePage(searchParams.page);
  const [{ items, total, totalPages, currentPage }, categories] = await Promise.all([
    getApps({ page, limit: 12, sort: 'popular' }),
    getCategories(),
  ]);

  if (total > 0 && page > totalPages) {
    permanentRedirect('/popular' + (totalPages > 1 ? '?page=' + totalPages : ''));
  }

  const pageUrl = SITE_URL + '/popular' + (currentPage > 1 ? '?page=' + currentPage : '');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'الأكثر تحميلًا على WALEED ZONE',
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((app, index) => ({
      '@type': 'ListItem',
      position: (currentPage - 1) * 12 + index + 1,
      name: app.name || 'تطبيق رقم ' + app.id,
      url: SITE_URL + '/app/' + app.id,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-8 border-b border-white/[0.06] pb-7">
        <p className="kicker text-[10px] font-black uppercase">TOP DOWNLOADS</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              الأكثر تحميلًا
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              التطبيقات والألعاب الأكثر طلبًا وتحميلًا من مكتبة WALEED ZONE.
            </p>
          </div>
          <span className="w-fit rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-xs font-bold text-slate-400">
            {total} عنصر
          </span>
        </div>
      </header>

      <div className="mb-8">
        <CategoryPills categories={categories} />
      </div>

      <AppGrid apps={items} />

      <div className="mt-12">
        <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/popular" />
      </div>
    </div>
  );
}
