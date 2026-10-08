'use client';
import { useTranslateUI } from '@/components/LocaleProvider';


import ContentState from '@/components/loading/ContentState';
import styles from '@/components/loading/loading.module.css';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslateUI();

  return <div className={styles.errorPage}>
    <ContentState
      kind="error"
      headingLevel={1}
      title={t("صار خطأ غير متوقع")}
      description={t("جرّب إعادة تحميل المحتوى. إذا استمرت المشكلة فالمشكلة غالبًا مؤقتة.")}
      action={<button type="button" onClick={() => reset()} className="primary-action">{t("إعادة المحاولة")}</button>}
    />
  </div>;
}
