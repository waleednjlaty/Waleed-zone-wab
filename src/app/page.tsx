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
import { SearchSkeleton } from '@/components/CatalogSkeleton';
import { homeCollections } from '@/components/catalog/presentation';
import { getApps, getCategories } from '@/lib/queries';
import { parsePage, sanitizeSearch } from '@/lib/utils';

export const dynamic = 'force-dynamic';
interface Props { searchParams: Promise<Record<string, string | string[] | undefined>>; }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const q = sanitizeSearch(first(params?.q) || '');
  const category = sanitizeSearch(first(params?.category) || '');
  const page = parsePage(first(params?.page));
  const browse = first(params?.browse) === 'all';
  if (q || category || page > 1 || browse) return {
    title: q ? `بحث: ${q}` : category ? `فئة ${category}` : browse && page === 1 ? 'المكتبة' : `صفحة ${page}`,
    description: `نتائج ${q || category || `الصفحة ${page}`} في وليد زون.`,
    robots: { index: false, follow: true },
    alternates: { canonical: '/' },
  };
  return {
    title: 'اكتشف التطبيقات والألعاب',
    description: 'مساحة عربية لاستكشاف التطبيقات والألعاب والأدوات، مع معلومات واضحة وروابط تحميل ومكتبة مفضلة خاصة بك.',
    alternates: { canonical: '/' },
  };
}

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const q = sanitizeSearch(first(params?.q) || '');
  const category = sanitizeSearch(first(params?.category) || '');
  const page = parsePage(first(params?.page));
  const browse = first(params?.browse) === 'all';
  const filtered = Boolean(q || category || page > 1 || browse);
  // Reuse existing read-only queries. The paginated library keeps its original page size.
  const [result, categories, discovery] = await Promise.all([
    getApps({ q, category, page, limit: 12 }),
    getCategories(),
    filtered ? Promise.resolve(null) : getApps({ limit: 48 }),
  ]);
  const collections = homeCollections(discovery?.items || []);

  return <div className="shell homepage">
    <section className="catalog-intro" aria-labelledby="discover-title">
      <div className="intro-copy"><p className="eyebrow">تطبيقات. ألعاب. آخر الإصدارات.</p><h1 id="discover-title">اكتشف أحدث التطبيقات والألعاب<span className="intro-dot">.</span></h1><p className="intro-description">ابحث، استكشف، واعرف تفاصيل الإصدار قبل التحميل.</p></div>
      <div className="intro-search"><Suspense fallback={<SearchSkeleton />}><SearchBar /></Suspense><p className="search-help">بالعربية أو الإنجليزية، بالاسم أو المطوّر أو التصنيف.</p></div>
    </section>

    {filtered ? <div className="filtered-catalog">
      <CategoryPills categories={categories} active={category || undefined} q={q || undefined} />
      <section id="library" className="catalog-section" aria-labelledby="results-title">
        <div className="section-heading"><div><h2 id="results-title">{q ? `نتائج «${q}»` : category || 'المكتبة'}</h2><p role="status">{result.total} نتيجة{page > 1 ? ` · صفحة ${result.currentPage}` : ''}</p></div><Link href="/" className="view-all">العودة للاكتشاف</Link></div>
        {result.items.length ? <><AppGrid apps={result.items} /><div className="catalog-pagination"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} q={q || undefined} category={category || undefined} browse={browse} /></div></> : <EmptyState hasQuery={Boolean(q || category)} />}
      </section>
    </div> : result.total === 0 ? <section id="library"><EmptyState hasQuery={false} /></section> : <>
      <section id="trending" className="catalog-section" aria-labelledby="trending-title">
        <SectionHeading id="trending-title" title="شائع الآن" subtitle={collections.trendingLabel} href="/?browse=all#library" icon="trend" />
        <div className="horizontal-cards">{collections.trending.map((app, index) => <AppCard key={app.id} app={app} rank={index + 1} />)}</div>
      </section>

      <section id="updates" className="catalog-section updates-section" aria-labelledby="updates-title">
        <SectionHeading id="updates-title" title="آخر التحديثات" subtitle="أحدث الإصدارات المضافة إلى المكتبة" href="/?browse=all#library" icon="refresh" />
        {collections.latest.length ? <div className="list-grid">{collections.latest.map(app => <AppCard key={app.id} app={app} variant="row" />)}</div> : <p className="section-empty">ستظهر الإصدارات هنا عندما تتوفر معلوماتها.</p>}
      </section>

      <section id="games" className="catalog-section" aria-labelledby="games-title">
        <SectionHeading id="games-title" title="ألعاب مختارة" subtitle="اختيارات من أحدث ألعاب المكتبة" href="#categories" linkLabel="تصفح التصنيفات" icon="game" />
        {collections.games.length ? <div className="featured-grid">{collections.games.map(app => <AppCard key={app.id} app={app} variant="featured" />)}</div> : <p className="section-empty">لم تُضف ألعاب إلى المكتبة بعد. استكشف التصنيفات المتاحة.</p>}
      </section>

      <section id="apps" className="catalog-section" aria-labelledby="apps-title">
        <SectionHeading id="apps-title" title="تطبيقات مختارة" subtitle="أدوات وتطبيقات تستحق الاستكشاف" href="#categories" linkLabel="تصفح التصنيفات" icon="apps" />
        {collections.apps.length ? <div className="list-grid">{collections.apps.map(app => <AppCard key={app.id} app={app} variant="row" />)}</div> : <p className="section-empty">ستظهر التطبيقات هنا عند إضافتها إلى المكتبة.</p>}
      </section>

      <section id="categories" className="catalog-section" aria-labelledby="categories-title">
        <SectionHeading id="categories-title" title="تصفح حسب التصنيف" subtitle="اذهب مباشرة إلى ما يهمك" icon="grid" />
        {categories.length ? <nav className="category-directory" aria-label="كل التصنيفات">{categories.map(item => <Link key={item} href={`/category/${encodeURIComponent(item)}`}><Icon name="grid" width={18} height={18} /><span>{item}</span><Icon name="chevron" width={15} height={15} /></Link>)}</nav> : <p className="section-empty">لا توجد تصنيفات متاحة حاليًا.</p>}
      </section>

      <section id="library" className="catalog-section recent-section" aria-labelledby="recent-title">
        <SectionHeading id="recent-title" title="أضيف حديثًا" subtitle="آخر ما وصل إلى Waleed Zone" href="/?browse=all#library" icon="spark" />
        <AppGrid apps={result.items} /><div className="catalog-pagination"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} /></div>
      </section>
    </>}
  </div>;
}
