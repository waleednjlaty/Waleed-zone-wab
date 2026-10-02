import type { ReactNode } from 'react';
import ListSkeleton, { type SkeletonLayout } from './ListSkeleton';
import Skeleton from './Skeleton';
import styles from './loading.module.css';

export default function SectionSkeleton({ count = 6, layout = 'grid', heading, children }: { count?: number; layout?: SkeletonLayout; heading?: ReactNode; children?: ReactNode }) {
  return <section className="catalog-section">
    {heading || <div className={`section-heading ${styles.sectionHeading}`}><div><Skeleton className={styles.heading} /><Skeleton className={styles.subtitle} /></div></div>}
    {children || <ListSkeleton count={count} layout={layout} />}
  </section>;
}
