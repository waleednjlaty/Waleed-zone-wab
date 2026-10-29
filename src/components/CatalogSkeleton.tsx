
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
      {contentOnly ? (
        <div className={styles.homeLoading} aria-hidden="true">
          <section className={styles.spotlightPlaceholder}>
            <Skeleton className={styles.spotlightArtwork} />
            <div className={styles.spotlightWash} />
            <div className={styles.spotlightIdentity}><Skeleton className={styles.spotlightIcon} /></div>
            <div className={styles.spotlightCopy}>
              <Skeleton className={styles.spotlightPill} />
              <Skeleton className={styles.spotlightEyebrow} />
              <Skeleton className={styles.spotlightTitle} />
              <Skeleton className={styles.spotlightDescription} />
              <Skeleton className={styles.spotlightDescriptionShort} />
              <div className={styles.spotlightTags}><Skeleton className={styles.spotlightTag} /><Skeleton className={styles.spotlightTagSmall} /></div>
              <Skeleton className={styles.spotlightButton} />
            </div>
            <div className={styles.spotlightControls}><Skeleton className={styles.control} /><Skeleton className={styles.control} /><Skeleton className={styles.control} /></div>
            <div className={styles.spotlightDots}><Skeleton className={styles.dot} /><Skeleton className={styles.dot} /><Skeleton className={styles.dotActive} /><Skeleton className={styles.dot} /></div>
          </section>
          <div className={styles.loadingCardRail}><ReusableCardSkeleton variant="compact" /><ReusableCardSkeleton variant="compact" /></div>
          <div className={styles.loadingRows}><ReusableCardSkeleton variant="row" /><ReusableCardSkeleton variant="row" /><ReusableCardSkeleton variant="row" /></div>
        </div>
      ) : (
        <div className={styles.catalogLoadingCards} aria-hidden="true">
          <div className={styles.loadingRows}>
            {Array.from({ length: 8 }, (_, index) => <ReusableCardSkeleton key={index} variant="compact" />)}
          </div>
          <div className={styles.pagination} />
        </div>
      )}
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
