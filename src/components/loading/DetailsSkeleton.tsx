import ImageSkeleton from './ImageSkeleton';
import LoadingRegion from './LoadingRegion';
import SectionSkeleton from './SectionSkeleton';
import Skeleton from './Skeleton';
import styles from './loading.module.css';

/** For the upcoming icon-led details layout; integrate once Agent A fixes its geometry. */
export default function DetailsSkeleton({ screenshots = 3, relatedCount = 4 }: { screenshots?: number; relatedCount?: number }) {
  return <LoadingRegion className={`shell ${styles.details}`} label="جارٍ تحميل تفاصيل التطبيق">
    <div className={styles.breadcrumb}><Skeleton className={styles.category} /></div>
    <div className={styles.detailsHeader}>
      <ImageSkeleton variant="icon" className={styles.detailsIcon} />
      <div className={styles.detailsCopy}><Skeleton className={styles.detailsTitle} /><Skeleton className={styles.developer} /><div className={styles.facts}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={styles.fact} />)}</div></div>
    </div>
    {screenshots > 0 && <div className={styles.screenshots}>{Array.from({ length: screenshots }, (_, i) => <ImageSkeleton key={i} variant="screenshot" />)}</div>}
    <section className={styles.description}><Skeleton className={styles.heading} />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className={styles.descriptionLine} />)}</section>
    <dl className={styles.detailsMetadata}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.metadataCell}><dt><Skeleton className={styles.category} /></dt><dd><Skeleton className={styles.title} /></dd></div>)}</dl>
    {relatedCount > 0 && <SectionSkeleton count={relatedCount} />}
  </LoadingRegion>;
}
