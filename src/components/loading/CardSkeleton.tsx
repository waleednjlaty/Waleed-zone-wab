import ImageSkeleton from './ImageSkeleton';
import Skeleton from './Skeleton';
import styles from './loading.module.css';

export interface CardSkeletonProps {
  variant?: 'compact' | 'row' | 'featured';
  ranked?: boolean;
}

export default function CardSkeleton({ variant = 'compact', ranked = false }: CardSkeletonProps) {
  return <div className={`app-card app-card--${variant} ${styles.card}`} aria-hidden="true">
    {variant === 'featured' && <div className="featured-art"><ImageSkeleton /></div>}
    <div className={`app-card-body ${styles.cardBody}`}>
      {ranked && <span className="app-rank"><Skeleton className={styles.rank} /></span>}
      <span className="app-icon"><ImageSkeleton variant="icon" /></span>
      <div className="app-card-copy">
        <div className="app-name-line"><span className={styles.nameSlot}><Skeleton className={styles.title} /></span></div>
        <div className={`app-category ${styles.categorySlot}`}><Skeleton className={styles.category} /></div>
        <div className={`app-metadata ${styles.metadataSlot}`}><Skeleton className={styles.metadata} /></div>
      </div>
      <span className={`card-chevron ${styles.chevronSlot}`} />
    </div>
  </div>;
}
