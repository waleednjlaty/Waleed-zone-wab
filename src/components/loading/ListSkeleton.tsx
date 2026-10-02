import CardSkeleton from './CardSkeleton';

export type SkeletonLayout = 'grid' | 'list' | 'rail' | 'featured';
const layoutClasses: Record<SkeletonLayout, string> = { grid: 'app-grid', list: 'list-grid', rail: 'horizontal-cards', featured: 'featured-grid' };

/** Presentational: wrap a standalone list in LoadingRegion for one announcement. */
export default function ListSkeleton({ count = 6, layout = 'grid' }: { count?: number; layout?: SkeletonLayout }) {
  return <div className={layoutClasses[layout]} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <CardSkeleton key={index} variant={layout === 'list' ? 'row' : layout === 'featured' ? 'featured' : 'compact'} ranked={layout === 'rail'} />)}
  </div>;
}
