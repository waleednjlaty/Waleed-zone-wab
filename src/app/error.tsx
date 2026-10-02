'use client';

import ContentState from '@/components/loading/ContentState';
import styles from '@/components/loading/loading.module.css';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className={styles.errorPage}>
    <ContentState
      kind="error"
      headingLevel={1}
      title="صار خطأ غير متوقع"
      description="جرّب إعادة تحميل المحتوى. إذا استمرت المشكلة فالمشكلة غالبًا مؤقتة."
      action={<button type="button" onClick={() => reset()} className="primary-action">إعادة المحاولة</button>}
    />
  </div>;
}
