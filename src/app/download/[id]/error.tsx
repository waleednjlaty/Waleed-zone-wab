'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

export default function DownloadError({ reset }: { reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="shell py-8"><section className="empty-state" aria-labelledby="download-error-title"><h1 ref={heading} id="download-error-title" tabIndex={-1}>تعذر تحميل معلومات الملف</h1><p role="status" aria-live="polite">تحقق من اتصالك ثم أعد المحاولة.</p><button className="primary-action" onClick={reset}>إعادة المحاولة</button><Link className="secondary-action" href="/">العودة إلى الرئيسية</Link></section></div>;
}
