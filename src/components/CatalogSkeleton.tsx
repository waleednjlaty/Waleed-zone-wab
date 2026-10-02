import Link from 'next/link';
import Brand from '@/components/Brand';
import Icon from '@/components/Icon';
import SectionHeading from '@/components/SectionHeading';
import ReusableCardSkeleton from './loading/CardSkeleton';
import LoadingRegion from './loading/LoadingRegion';
import SectionSkeleton from './loading/SectionSkeleton';
import Skeleton from './loading/Skeleton';
import styles from './loading/loading.module.css';

// Keep existing imports working while the async pages evolve on Agent A's branch.
export function SearchSkeleton() {
  return <LoadingRegion label="جارٍ تجهيز البحث"><Skeleton className={styles.search} /></LoadingRegion>;
}

export function CardSkeleton({ featured = false, row = false }: { featured?: boolean; row?: boolean }) {
  return <ReusableCardSkeleton variant={featured ? 'featured' : row ? 'row' : 'compact'} />;
}

export default function CatalogSkeleton({ contentOnly = false }: { contentOnly?: boolean }) {
  return <div className={`${contentOnly ? '' : 'shell'} ${styles.catalog}`}>
    {!contentOnly && <section className="catalog-intro" aria-labelledby="loading-discover-title">
      <div className="intro-copy"><p className="eyebrow">تطبيقات. ألعاب. آخر الإصدارات.</p><h1 id="loading-discover-title">اكتشف أحدث التطبيقات والألعاب<span className="intro-dot">.</span></h1><p className="intro-description">ابحث، استكشف، واعرف تفاصيل الإصدار قبل التحميل.</p></div>
      <div className="intro-search"><SearchSkeleton /><p className="search-help">بالاسم أو التصنيف، ستجد ما تبحث عنه.</p></div>
    </section>}
    <LoadingRegion label="جارٍ تحميل التطبيقات والألعاب">
      <SectionSkeleton layout="rail" heading={<SectionHeading id="loading-trending" title="شائع الآن" subtitle="اختيارات من المكتبة" icon="trend" />} />
      <SectionSkeleton layout="list" heading={<SectionHeading id="loading-updates" title="آخر التحديثات" subtitle="أحدث الإصدارات المضافة إلى المكتبة" icon="refresh" />} />
      <SectionSkeleton layout="featured" count={3} heading={<SectionHeading id="loading-games" title="ألعاب مختارة" subtitle="اختيارات من أحدث ألعاب المكتبة" icon="game" />} />
      <SectionSkeleton layout="list" heading={<SectionHeading id="loading-apps" title="تطبيقات مختارة" subtitle="أدوات وتطبيقات تستحق الاستكشاف" icon="apps" />} />
      <SectionSkeleton heading={<SectionHeading id="loading-categories" title="تصفح حسب التصنيف" subtitle="اذهب مباشرة إلى ما يهمك" icon="grid" />}>
        <div className="category-directory">{Array.from({ length: 8 }, (_, index) => <div className={styles.categoryEntry} key={index}><Skeleton className={styles.category} /></div>)}</div>
      </SectionSkeleton>
      <SectionSkeleton count={12} heading={<SectionHeading id="loading-recent" title="أضيف حديثًا" subtitle="آخر ما وصل إلى Waleed Zone" icon="spark" />} />
      <div className={styles.pagination} />
    </LoadingRegion>
  </div>;
}

const navigationLinks = [
  { href: '/', label: 'الرئيسية' },
  { href: '/#apps', label: 'التطبيقات' },
  { href: '/#games', label: 'الألعاب' },
  { href: '/#categories', label: 'التصنيفات' },
  { href: '/#updates', label: 'التحديثات' },
];

/** Compatibility name: render usable static navigation, never a skeleton header. */
export function NavigationSkeleton() {
  const links = navigationLinks.map(link => <Link key={link.href} href={link.href} className="nav-link">{link.label}</Link>);
  return <header className="site-header">
    <nav className="shell header-inner" aria-label="التنقل الرئيسي">
      <Link href="/" className="brand-link" aria-label="Waleed Zone، الرئيسية"><Brand /></Link>
      <div className="desktop-nav">{links}</div>
      <div className="header-actions">
        <Link className="icon-button header-search" href="/?browse=all#library" aria-label="تصفح المكتبة"><Icon name="search" /><span>بحث</span><kbd>/</kbd></Link>
        <Link className="icon-button account-link" href="/account" aria-label="حسابي ومكتبتي"><Icon name="account" /></Link>
        <details className={`mobile-menu-button ${styles.fallbackMenu}`}><summary className="icon-button" aria-label="فتح القائمة"><Icon name="menu" /></summary><nav aria-label="قائمة الهاتف">{links}<Link className="nav-link" href="/account">حسابي ومكتبتي</Link></nav></details>
      </div>
    </nav>
  </header>;
}
