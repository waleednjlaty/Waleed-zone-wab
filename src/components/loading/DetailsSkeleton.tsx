
'use client';
import { useTranslateUI } from '@/components/LocaleProvider';
import ImageSkeleton from './ImageSkeleton';
import LoadingRegion from './LoadingRegion';
import SectionSkeleton from './SectionSkeleton';
import Skeleton from './Skeleton';
import styles from './loading.module.css';

/** Reuses Phase 2 geometry; gallery defaults off because it is optional metadata. */
export default function DetailsSkeleton({ screenshots = 0, relatedCount = 4 }: { screenshots?: number; relatedCount?: number }) {
  const t = useTranslateUI();

  return <LoadingRegion className="shell detail-page" label={t("جارٍ تحميل تفاصيل التطبيق")}>
    <div className="detail-breadcrumbs"><Skeleton className={styles.category} /></div>
    <div className="detail-summary">
      <div className="detail-identity"><span className="detail-icon"><ImageSkeleton variant="icon" /></span><div className={`detail-name ${styles.detailsCopy}`}><Skeleton className={styles.category} /><Skeleton className={styles.detailsTitle} /><Skeleton className={styles.developer} /></div></div>
      <div className="detail-primary-meta">{Array.from({ length: 2 }, (_, i) => <span key={i}><Skeleton className={styles.fact} /></span>)}</div>
      <div className="detail-download-area"><Skeleton className={styles.downloadAction} /><Skeleton className={styles.downloadAction} /></div>
    </div>
    <div className="detail-content-grid">
      <div className="detail-main">
        {screenshots > 0 && <div className="screenshot-carousel">{Array.from({ length: screenshots }, (_, i) => <figure key={i} className="relative"><ImageSkeleton variant="fill" /></figure>)}</div>}
        <div className={`detail-section ${styles.description}`}><Skeleton className={styles.heading} />{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={styles.descriptionLine} />)}</div>
      </div>
      <div className="detail-technical detail-section"><Skeleton className={styles.heading} /><dl>{Array.from({ length: 6 }, (_, i) => <div key={i}><dt><Skeleton className={styles.category} /></dt><dd><Skeleton className={styles.title} /></dd></div>)}</dl></div>
    </div>
    {relatedCount > 0 && <SectionSkeleton count={relatedCount} />}
  </LoadingRegion>;
}
