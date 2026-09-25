import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import Pagination from '@/components/Pagination';
import { getApps, getCategories } from '@/lib/queries';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { categoryPath, decodePathSegment, parsePage, serializeJsonLd } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

async function getCategory(params: CategoryPageProps['params']): Promise<string> {
  const resolved = await params;
  return decodePathSegment(resolved.category).slice(0, 100);
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const [category, resolvedSearchParams] = await Promise.all([getCategory(params), searchParams]);
  const page = parsePage(resolvedSearchParams.page);
  const basePath = categoryPath(category);
  const canonical = page > 1 ? basePath + '?page=' + page : basePath;
  const title =
    'تحميل ' + category + ' — تطبيقات وألعاب' + (page > 1 ? ' — الصفحة ' + page : '');

  return {
    title,
    description:
      'تصفح أحدث ' + category + ' في WALEED ZONE مع معلومات الإصدار والحجم وروابط التحميل.',
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE_NAME,
      title,
      description:
        'تصفح أحدث ' + category + ' في WALEED ZONE مع معلومات واضحة وروابط تحميل.',
      url: SITE_URL + canonical,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [category, resolvedSearchParams] = await Promise.all([getCategory(params), searchParams]);
  const page = parsePage(resolvedSearchParams.page);

  const [{ items, total, totalPages, currentPage }, categories] = await Promise.all([
    getApps({ category, page, limit: 12 }),
    getCategories(),
  ]);

  if (!category || total === 0) notFound();

  const basePath = categoryPath(category);
  if (page > totalPages) {
    permanentRedirect(basePath + (totalPages > 1 ? '?page=' + totalPages : ''));
  }
  const pageUrl = SITE_URL + basePath + (currentPage > 1 ? '?page=' + currentPage : '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'WALEED ZONE',
            item: SITE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: category,
            item: SITE_URL + basePath,
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: category,
        url: pageUrl,
        numberOfItems: items.length,
        itemListElement: items.map((app, index) => ({
          '@type': 'ListItem',
          position: (currentPage - 1) * 12 + index + 1,
          name: app.name || 'تطبيق رقم ' + app.id,
          url: SITE_URL + '/app/' + app.id,
        })),
      },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 sm:pb-24 sm:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <nav aria-label="مسار التنقل" className="mb-6 flex items-center gap-2 text-xs font-bold text-slate-600 sm:text-sm">
        <Link href="/" className="transition hover:text-cyan-300">المكتبة</Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-300">{category}</span>
      </nav>

      <header className="mb-8 border-b border-white/[0.06] pb-7">
        <p className="kicker text-[10px] font-black uppercase">CATEGORY</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              {category}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              أحدث تطبيقات وألعاب {category} المنشورة على WALEED ZONE، مع معلومات الإصدار والحجم والمنصة قبل التحميل.
            </p>
          </div>
          <span className="w-fit rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-xs font-bold text-slate-400">
            {total} نتيجة
          </span>
        </div>
      </header>

      <div className="mb-8">
        <CategoryPills categories={categories} active={category} />
      </div>

      <AppGrid apps={items} />

      <div className="mt-12">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath={basePath}
        />
      </div>
    </div>
  );
}
