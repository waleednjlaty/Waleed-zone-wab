import Brand from '@/components/Brand';

export function SearchSkeleton() {
  return <div className="skeleton search-skeleton" aria-hidden="true" />;
}

export function CardSkeleton({ featured = false, row = false }: { featured?: boolean; row?: boolean }) {
  return <div className={`card-skeleton${featured ? ' card-skeleton--featured' : ''}${row ? ' card-skeleton--row' : ''}`} aria-hidden="true">
    {featured && <div className="skeleton skeleton-art" />}
    <div className="skeleton-card-body"><span className="skeleton skeleton-icon" /><span className="skeleton-card-copy"><span className="skeleton skeleton-title" /><span className="skeleton skeleton-line" /><span className="skeleton skeleton-meta" /></span></div>
  </div>;
}

export default function CatalogSkeleton() {
  return <div className="shell catalog-loading" role="status" aria-label="جارٍ تحميل التطبيقات والألعاب"><span className="sr-only">جارٍ تحميل المحتوى</span><div aria-hidden="true">
    <div className="catalog-intro loading-intro"><div className="loading-copy"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-intro-title" /><div className="skeleton skeleton-line" /></div><div className="intro-search"><SearchSkeleton /></div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="horizontal-cards">{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}</div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="list-grid">{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} row />)}</div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="featured-grid">{Array.from({ length: 3 }, (_, index) => <CardSkeleton key={index} featured />)}</div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="list-grid">{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} row />)}</div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="category-directory">{Array.from({ length: 8 }, (_, index) => <div className="skeleton-category" key={index}><span className="skeleton skeleton-line" /></div>)}</div></div>
    <div className="loading-section"><div className="skeleton skeleton-heading" /><div className="app-grid">{Array.from({ length: 12 }, (_, index) => <CardSkeleton key={index} />)}</div></div>
  </div></div>;
}

export function NavigationSkeleton() {
  return <header className="site-header" aria-busy="true" aria-label="جارٍ تحميل التنقل">
    <div className="shell header-inner"><Brand /><div className="desktop-nav" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className="skeleton navigation-skeleton-link" />)}</div><div className="header-actions" aria-hidden="true"><span className="skeleton icon-button" /><span className="skeleton icon-button" /></div></div>
  </header>;
}
