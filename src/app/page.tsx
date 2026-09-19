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
      <section className="relative isolate overflow-hidden">
        <div className="bg-grid absolute inset-0 -z-20" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-24 top-10 -z-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -left-24 top-28 -z-10 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20 md:pb-20 md:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3.5 py-1.5 text-xs font-bold text-cyan-200 shadow-[0_10px_30px_-20px_rgba(34,211,238,0.8)]">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
              {total > 0 ? total + ' تطبيق ولعبة متاحة' : 'تحديثات مستمرة'}
            </div>

            <h1 className="mt-6 text-4xl font-black leading-[1.15] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
              كل اللي تحتاجه،
              <span className="block bg-gradient-to-l from-cyan-300 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                بمكان واحد.
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base md:text-lg">
              تطبيقات، ألعاب وأدوات مختارة ومحدثة باستمرار. ابحث بسرعة، شوف التفاصيل، وحمّل بالطريقة الأنسب إلك.
            </p>

            <div className="mx-auto mt-8 max-w-2xl sm:mt-10">
              <Suspense fallback={null}>
                <SearchBar />
              </Suspense>
            </div>

            <div className="mx-auto mt-5 max-w-3xl">
              <CategoryPills categories={categories} active={category || undefined} q={q || undefined} />
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-cyan-300">✓</span> واجهة سريعة ومتجاوبة
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-cyan-300">✓</span> بحث وفلترة فورية
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-cyan-300">✓</span> تحميل مباشر أو عبر تيليجرام
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mb-7 flex items-end justify-between gap-4 border-b border-slate-800/70 pb-5">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300/75">
              Waleed Zone Library
            </p>
            <h2 className="text-xl font-black text-white sm:text-2xl">
              {q ? 'نتائج البحث عن «' + q + '»' : category ? category : 'أحدث الإضافات'}
            </h2>
          </div>
          <span className="shrink-0 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-400 sm:text-sm">
            {total} نتيجة
          </span>
        </div>

        {items.length > 0 ? (
          <>
            <AppGrid apps={items} />
            <div className="mt-12">
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
