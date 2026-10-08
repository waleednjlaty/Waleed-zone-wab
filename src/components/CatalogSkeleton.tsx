
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
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
export async function SearchSkeleton() {
  const locale = await getLocale(), t = (text: string) => translateUI(locale, text);

  return <LoadingRegion label={t("جارٍ تجهيز البحث")}><Skeleton className={styles.search} /></LoadingRegion>;
}

export async function CardSkeleton({ featured = false, row = false }: { featured?: boolean; row?: boolean }) {
  const locale = await getLocale(), t = (text: string) => translateUI(locale, text);

  return <ReusableCardSkeleton variant={featured ? 'featured' : row ? 'row' : 'compact'} />;
}

export default async function CatalogSkeleton({ contentOnly = false }: { contentOnly?: boolean }) {
  const locale = await getLocale(), t = (text: string) => translateUI(locale, text);

  return <div className={`${contentOnly ? '' : 'shell'} ${styles.catalog}`}>
    {!contentOnly && <section className="catalog-intro" aria-labelledby="loading-discover-title">
      <div className="intro-copy"><p className="eyebrow" lang="en" dir="ltr">Waleed Zone</p><h1 id="loading-discover-title">{t("وليد زون — تطبيقات وألعاب")}<span className="intro-dot">.</span></h1><p className="intro-description">{t("ابحث، استكشف، واعرف تفاصيل الإصدار قبل التحميل.")}</p></div>
      <div className="intro-search"><SearchSkeleton /><p className="search-help">{t("بالاسم أو التصنيف، ستجد ما تبحث عنه.")}</p></div>
    </section>}
    <LoadingRegion label={t("جارٍ تحميل التطبيقات والألعاب")}>
      <SectionSkeleton layout="rail" heading={<SectionHeading id="loading-trending" title={t("شائع الآن")} subtitle={t("اختيارات من المكتبة")} icon="trend" />} />
      <SectionSkeleton layout="list" heading={<SectionHeading id="loading-updates" title={t("آخر التحديثات")} subtitle={t("أحدث الإصدارات المضافة إلى المكتبة")} icon="refresh" />} />
      <SectionSkeleton layout="featured" count={3} heading={<SectionHeading id="loading-games" title={t("ألعاب مختارة")} subtitle={t("اختيارات من أحدث ألعاب المكتبة")} icon="game" />} />
      <SectionSkeleton layout="list" heading={<SectionHeading id="loading-apps" title={t("تطبيقات مختارة")} subtitle={t("أدوات وتطبيقات تستحق الاستكشاف")} icon="apps" />} />
      <SectionSkeleton heading={<SectionHeading id="loading-categories" title={t("تصفح حسب التصنيف")} subtitle={t("اذهب مباشرة إلى ما يهمك")} icon="grid" />}>
        <div className="category-directory">{Array.from({ length: 8 }, (_, index) => <div className={styles.categoryEntry} key={index}><Skeleton className={styles.category} /></div>)}</div>
      </SectionSkeleton>
      <SectionSkeleton count={12} heading={<SectionHeading id="loading-recent" title={t("أضيف حديثًا")} subtitle={t("آخر ما وصل إلى Waleed Zone")} icon="spark" />} />
      <div className={styles.pagination} />
    </LoadingRegion>
  </div>;
}

const navigationLinks = [
  { href: '/', label: 'الرئيسية' },
  { href: '/apps', label: 'التطبيقات' },
  { href: '/games', label: 'الألعاب' },
  { href: '/#categories', label: 'التصنيفات' },
  { href: '/#updates', label: 'التحديثات' },
];

/** Compatibility name: render usable static navigation, never a skeleton header. */
export async function NavigationSkeleton() {
  const locale = await getLocale(), t = (text: string) => translateUI(locale, text);

  const links = navigationLinks.map(link => link.href==='/apps'||link.href==='/games'?<a key={link.href} href={link.href} className="nav-link">{t(link.label)}</a>:<Link key={link.href} href={link.href} className="nav-link">{t(link.label)}</Link>);
  return <header className="site-header">
    <nav className="shell header-inner" aria-label={t("التنقل الرئيسي")}>
      <Link href="/" className="brand-link" aria-label={t("Waleed Zone، الرئيسية")}><Brand /></Link>
      <div className="desktop-nav">{links}</div>
      <div className="header-actions">
        <Link className="icon-button header-search" href="/?browse=all#library" aria-label={t("تصفح المكتبة")}><Icon name="search" /><span>{t("بحث")}</span><kbd>/</kbd></Link>
        <Link className="icon-button account-link" href="/account" aria-label={t("حسابي ومكتبتي")}><Icon name="account" /></Link>
        <details className={`mobile-menu-button ${styles.fallbackMenu}`}><summary className="icon-button" aria-label={t("فتح القائمة")}><Icon name="menu" /></summary><nav aria-label={t("قائمة الهاتف")}>{links}<Link className="nav-link" href="/account">{t("حسابي ومكتبتي")}</Link></nav></details>
      </div>
    </nav>
  </header>;
}
