import type { Metadata } from 'next';
import { Suspense } from 'react';
import { permanentRedirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import SearchBar from '@/components/SearchBar';
import { getApps, getCategories } from '@/lib/queries';
import { categoryPath, parsePage, sanitizeSearch } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

async function readParams(searchParams: HomeProps['searchParams']) {
  const safeParams = (await searchParams) ?? {};
  return {
    q: sanitizeSearch(firstValue(safeParams.q) ?? ''),
    category: sanitizeSearch(firstValue(safeParams.category) ?? ''),
    page: parsePage(firstValue(safeParams.page)),
  };
}

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const { q, page } = await readParams(searchParams);

  if (q) {
    return {
      title: 'نتائج البحث عن «' + q + '»',
      description: 'نتائج البحث عن ' + q + ' في مكتبة WALEED ZONE للتطبيقات والألعاب والأدوات.',
      robots: { index: false, follow: true },
    };
  }

  const title = page > 1 ? 'أحدث التطبيقات والألعاب — الصفحة ' + page : undefined;
  const canonical = page > 1 ? '/?page=' + page : '/';

  return {
    ...(title ? { title } : {}),
    alternates: { canonical },
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, category, page } = await readParams(searchParams);

  if (category && !q) {
    const target = categoryPath(category) + (page > 1 ? '?page=' + page : '');
    permanentRedirect(target);
  }

  const [{ items, total, totalPages, currentPage }, categories] = await Promise.all([
    getApps({ q, category, page, limit: 12 }),
    getCategories(),
  ]);

  if (total > 0 && page > totalPages) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (totalPages > 1) params.set('page', String(totalPages));
    const query = params.toString();
    permanentRedirect(query ? '/?' + query : '/');
  }

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.05]">
        <div className="app-shell pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)] lg:items-end lg:gap-16 lg:py-20">
          <div>
            <p className="kicker text-[11px] font-black uppercase">WALEED ZONE LIBRARY</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-6xl">
              نزّل اللي بدك ياه،
              <span className="block text-cyan-300">بدون لف ودوران.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              مكتبة عربية للتطبيقات والألعاب والأدوات. بحث سريع، معلومات واضحة، وروابط تحميل مباشرة أو عبر تيليجرام.
            </p>

            <div className="mt-7 max-w-2xl">
              <Suspense fallback={null}>
                <SearchBar />
              </Suspense>
            </div>
          </div>

          <div className="panel-strong rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-500">المكتبة الآن</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-white">{total}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z" />
                  <path strokeLinecap="round" d="M8 8h8M8 12h8M8 16h5" />
                </svg>
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-5">
              <div>
                <p className="text-xl font-black text-white">{categories.length}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">فئات متاحة</p>
              </div>
              <div>
                <p className="text-xl font-black text-white">RTL</p>
                <p className="mt-1 text-xs font-medium text-slate-500">مصمم للعربي</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-3 text-xs font-medium text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              المحتوى يتحدث باستمرار من Waleed Zone
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 sm:pb-24 sm:pt-9">
        <div className="mb-8">
          <CategoryPills categories={categories} active={category || undefined} q={q || undefined} />
        </div>

        <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">{q ? 'نتائج البحث' : 'آخر ما نزل'}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
              {q ? 'نتائج البحث عن «' + q + '»' : 'أحدث الإضافات'}
            </h2>
          </div>
          <span className="w-fit rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-xs font-bold text-slate-400">
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
