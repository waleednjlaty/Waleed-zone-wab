import { Suspense } from 'react';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import SearchBar from '@/components/SearchBar';
import { getApps, getCategories } from '@/lib/queries';
import { parsePage, sanitizeSearch } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const safeParams = searchParams ?? {};
  const q = sanitizeSearch(firstValue(safeParams.q) ?? '');
  const category = sanitizeSearch(firstValue(safeParams.category) ?? '');
  const page = parsePage(firstValue(safeParams.page));

  const [{ items, total, totalPages, currentPage }, categories] = await Promise.all([
    getApps({ q, category, page, limit: 12 }),
    getCategories(),
  ]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium text-cyan-300">
              {total > 0 ? `${total} تطبيق وأداة مجانية` : 'آخر التحديثات'}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
              حمل أحدث{' '}
              <span className="bg-gradient-to-l from-cyan-400 to-violet-500 bg-clip-text text-transparent">
                التطبيقات والألعاب
              </span>{' '}
              مجانًا
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
              مكتبة WALEED ZONE — تطبيقات وألعاب وأدوات محدثة باستمرار، تحميل مباشر أو عبر تيليجرام
              بضغطة واحدة.
            </p>
            <div className="mt-8">
              <Suspense fallback={null}>
                <SearchBar />
              </Suspense>
            </div>
            <div className="mt-6 flex justify-center">
              <CategoryPills categories={categories} active={category || undefined} q={q || undefined} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white sm:text-2xl">
            {q ? `نتائج البحث عن «${q}»` : 'أحدث التطبيقات'}
          </h2>
          <span className="text-sm text-slate-400">{total} نتيجة</span>
        </div>

        {items.length > 0 ? (
          <>
            <AppGrid apps={items} />
            <div className="mt-10">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                q={q || undefined}
                category={category || undefined}
              />
            </div>
          </>
        ) : (
          <EmptyState hasQuery={Boolean(q || category)} />
        )}
      </section>
    </>
  );
}
