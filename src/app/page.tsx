import JsonLd from '@/components/JsonLd';
/* eslint-disable @next/next/no-html-link-for-pages -- Catalog directories intentionally use document navigation. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import AppCard from '@/components/AppCard';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import EmptyState from '@/components/EmptyState';
import Icon from '@/components/Icon';
import Pagination from '@/components/Pagination';
import SearchBar from '@/components/SearchBar';
import SectionHeading from '@/components/SectionHeading';
import SearchResultsSkeleton from '@/components/loading/SearchResultsSkeleton';
import CatalogSkeleton, { SearchSkeleton } from '@/components/CatalogSkeleton';
import { homeCollections } from '@/components/catalog/presentation';
import { getApps, getCategories } from '@/lib/queries';
import { parsePage, sanitizeSearch } from '@/lib/utils';
import { HOME_TITLE, SITE_DESCRIPTION } from '@/lib/site';
import { pageMetadata, websiteStructuredData } from '@/lib/seo';
import { getLocale } from '@/lib/locale-server';

export const dynamic = 'force-dynamic';
interface Props { searchParams: Promise<Record<string, string | string[] | undefined>>; }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);
  const english = locale === 'en';
  const q = sanitizeSearch(first(params?.q) || '');
  const category = sanitizeSearch(first(params?.category) || '');
  const page = parsePage(first(params?.page));
  const browse = first(params?.browse) === 'all';
  if (q || category || page > 1 || browse) return pageMetadata(
    english ? (q ? `Search: ${q}` : category ? `Category ${category}` : browse && page === 1 ? 'Library' : `Page ${page}`) : (q ? `بحث: ${q}` : category ? `فئة ${category}` : browse && page === 1 ? 'المكتبة' : `صفحة ${page}`),
    english ? `Results for ${q || category || `page ${page}`} on Waleed Zone.` : `نتائج ${q || category || `الصفحة ${page}`} في وليد زون.`, '/', { noindex: true, locale },
  );
  return pageMetadata(english ? 'Waleed Zone — Apps & Games' : HOME_TITLE, english ? 'Discover apps and games, release details, platforms and download options on Waleed Zone.' : SITE_DESCRIPTION, '/', { absoluteTitle: true, locale });
}

export default async function Home({ searchParams }: Props) {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);
  const english = locale === 'en';
  const q = sanitizeSearch(first(params?.q) || '');
  const category = sanitizeSearch(first(params?.category) || '');
  const page = parsePage(first(params?.page));
  const browse = first(params?.browse) === 'all';
  const filtered = Boolean(q || category || page > 1 || browse);
  return <div className="shell homepage">
    {!filtered && <JsonLd data={websiteStructuredData(locale)} />}
    <section className="catalog-intro" aria-labelledby="discover-title">
      <div className="intro-copy"><p className="eyebrow" lang="en" dir="ltr">Waleed Zone</p><h1 id="discover-title">{english ? 'Waleed Zone — Apps & Games' : 'وليد زون — تطبيقات وألعاب'}<span className="intro-dot">.</span></h1><p className="intro-description">{english ? 'Search, explore and check release details before downloading.' : 'ابحث، استكشف، واعرف تفاصيل الإصدار قبل التحميل.'}</p><nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label={english ? 'Waleed Zone library' : 'مكتبة وليد زون'}><a className="view-all" href="/apps">{english ? 'Waleed Zone Apps →' : 'تطبيقات وليد زون ←'}</a><a className="view-all" href="/games">{english ? 'Waleed Zone Games →' : 'ألعاب وليد زون ←'}</a></nav></div>
      <div className="intro-search"><Suspense fallback={<SearchSkeleton />}><SearchBar /></Suspense><p className="search-help">{english ? 'Search in Arabic or English by name, developer or category.' : 'بالعربية أو الإنجليزية، بالاسم أو المطوّر أو التصنيف.'}</p></div>
    </section>

    <Suspense key={`${q}:${category}:${page}:${browse}`} fallback={filtered ? <SearchResultsSkeleton /> : <CatalogSkeleton contentOnly />}>
      <CatalogContent q={q} category={category} page={page} browse={browse} filtered={filtered} locale={locale} />
    </Suspense>
  </div>;
}

async function CatalogContent({ q, category, page, browse, filtered, locale }: { q: string; category: string; page: number; browse: boolean; filtered: boolean; locale: 'ar' | 'en' }) {
  const english = locale === 'en';
  // Reuse existing read-only queries. The paginated library keeps its original page size.
  const [result, categories, discovery] = await Promise.all([
    getApps({ q, category, page, limit: 12 }),
    getCategories(),
    filtered ? Promise.resolve(null) : getApps({ limit: 48 }),
  ]);
  const collections = homeCollections(discovery?.items || [], locale);

  return <>
    {filtered ? <div className="filtered-catalog">
      <CategoryPills categories={categories} active={category || undefined} q={q || undefined} />
      <section id="library" className="catalog-section" aria-labelledby="results-title">
        <div className="section-heading"><div><h2 id="results-title">{q ? (english ? `Results for “${q}”` : `نتائج «${q}»`) : category || (english ? 'Library' : 'المكتبة')}</h2><p role="status">{result.total} {english ? 'results' : 'نتيجة'}{page > 1 ? (english ? ` · Page ${result.currentPage}` : ` · صفحة ${result.currentPage}`) : ''}</p></div><Link href="/" className="view-all">{english ? 'Back to discovery' : 'العودة للاكتشاف'}</Link></div>
        {result.items.length ? <><AppGrid apps={result.items} /><div className="catalog-pagination"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} q={q || undefined} category={category || undefined} browse={browse} /></div></> : <EmptyState hasQuery={Boolean(q || category)} />}
      </section>
    </div> : result.total === 0 ? <section id="library"><EmptyState hasQuery={false} /></section> : <>
      <section id="trending" className="catalog-section" aria-labelledby="trending-title">
        <SectionHeading id="trending-title" title={english ? 'Trending now' : 'شائع الآن'} subtitle={collections.trendingLabel} href="/?browse=all#library" icon="trend" />
        <div className="horizontal-cards">{collections.trending.map((app, index) => <AppCard key={app.id} app={app} rank={index + 1} />)}</div>
      </section>

      <section id="updates" className="catalog-section updates-section" aria-labelledby="updates-title">
        <SectionHeading id="updates-title" title={english ? 'Latest updates' : 'آخر التحديثات'} subtitle={english ? 'Newest releases added to the library' : 'أحدث الإصدارات المضافة إلى المكتبة'} href="/?browse=all#library" icon="refresh" />
        {collections.latest.length ? <div className="list-grid">{collections.latest.map(app => <AppCard key={app.id} app={app} variant="row" />)}</div> : <p className="section-empty">{english ? 'Releases will appear here when their information is available.' : 'ستظهر الإصدارات هنا عندما تتوفر معلوماتها.'}</p>}
      </section>

      <section id="games" className="catalog-section" aria-labelledby="games-title">
        <SectionHeading id="games-title" title={english ? 'Featured games' : 'ألعاب مختارة'} subtitle={english ? 'Selections from the latest games in the library' : 'اختيارات من أحدث ألعاب المكتبة'} href="/games" nativeNavigation linkLabel={english ? 'All games' : 'كل الألعاب'} icon="game" />
        {collections.games.length ? <div className="featured-grid">{collections.games.map(app => <AppCard key={app.id} app={app} variant="featured" />)}</div> : <p className="section-empty">{english ? 'No games have been added yet. Explore the available categories.' : 'لم تُضف ألعاب إلى المكتبة بعد. استكشف التصنيفات المتاحة.'}</p>}
      </section>

      <section id="apps" className="catalog-section" aria-labelledby="apps-title">
        <SectionHeading id="apps-title" title={english ? 'Featured apps' : 'تطبيقات مختارة'} subtitle={english ? 'Tools and apps worth exploring' : 'أدوات وتطبيقات تستحق الاستكشاف'} href="/apps" nativeNavigation linkLabel={english ? 'All apps' : 'كل التطبيقات'} icon="apps" />
        {collections.apps.length ? <div className="list-grid">{collections.apps.map(app => <AppCard key={app.id} app={app} variant="row" />)}</div> : <p className="section-empty">{english ? 'Apps will appear here when they are added to the library.' : 'ستظهر التطبيقات هنا عند إضافتها إلى المكتبة.'}</p>}
      </section>

      <section id="categories" className="catalog-section" aria-labelledby="categories-title">
        <SectionHeading id="categories-title" title={english ? 'Browse by category' : 'تصفح حسب التصنيف'} subtitle={english ? 'Jump directly to what interests you' : 'اذهب مباشرة إلى ما يهمك'} icon="grid" />
        {categories.length ? <nav className="category-directory" aria-label={english ? 'All categories' : 'كل التصنيفات'}>{categories.map(item => <Link key={item} href={`/category/${encodeURIComponent(item)}`}><Icon name="grid" width={18} height={18} /><span>{item}</span><Icon name="chevron" width={15} height={15} /></Link>)}</nav> : <p className="section-empty">{english ? 'No categories are available right now.' : 'لا توجد تصنيفات متاحة حاليًا.'}</p>}
      </section>

      <section id="library" className="catalog-section recent-section" aria-labelledby="recent-title">
        <SectionHeading id="recent-title" title={english ? 'Recently added' : 'أضيف حديثًا'} subtitle={english ? 'The latest additions to Waleed Zone' : 'آخر ما وصل إلى Waleed Zone'} href="/?browse=all#library" icon="spark" />
        <AppGrid apps={result.items} /><div className="catalog-pagination"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} /></div>
      </section>
    </>}
  </>;
}
