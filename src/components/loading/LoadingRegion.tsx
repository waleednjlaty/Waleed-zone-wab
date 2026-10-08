
'use client';
import { useTranslateUI } from '@/components/LocaleProvider';
import type { ReactNode } from 'react';
import styles from './loading.module.css';

export default function LoadingRegion({ children, label = 'جارٍ تحميل المحتوى', className = '' }: { children: ReactNode; label?: string; className?: string }) {
  const t = useTranslateUI();

  return <div className={className}>
    {/* Keep the announcement outside the busy subtree, which AT may defer. */}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t(label)}</span>
    <div aria-busy="true" aria-hidden="true" className={styles.visual}>{children}</div>
  </div>;
}
