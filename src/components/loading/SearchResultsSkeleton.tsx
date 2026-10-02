import LoadingRegion from './LoadingRegion';
import SectionSkeleton from './SectionSkeleton';

/** Agent A can use this at the results boundary, leaving the search input usable. */
export default function SearchResultsSkeleton({ count = 12 }: { count?: number }) {
  return <LoadingRegion label="جارٍ تحميل نتائج البحث"><SectionSkeleton count={count} /></LoadingRegion>;
}
