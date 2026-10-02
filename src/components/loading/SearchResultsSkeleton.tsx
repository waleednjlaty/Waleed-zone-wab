import LoadingRegion from './LoadingRegion';
import SectionSkeleton from './SectionSkeleton';
import Skeleton from './Skeleton';
import styles from './loading.module.css';

/** Agent A can use this at the results boundary, leaving the search input usable. */
export default function SearchResultsSkeleton({ count = 12, suggestions = false }: { count?: number; suggestions?: boolean }) {
  if (suggestions) return <LoadingRegion label="جارٍ البحث…"><div className="suggestion-loading">{Array.from({ length: count }, (_, index) => <Skeleton key={index} className={styles.suggestion} />)}</div></LoadingRegion>;
  return <LoadingRegion label="جارٍ تحميل نتائج البحث"><SectionSkeleton count={count} /></LoadingRegion>;
}
