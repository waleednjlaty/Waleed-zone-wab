'use client';
import { useEffect, useState } from 'react';
import { localeFromCookie, localeDirection, type Locale } from '@/lib/locale';
import { translateUI } from '@/lib/ui-translations';

/** Root-layout failures render without the locale provider. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>('ar');
  useEffect(() => { setLocale(localeFromCookie(document.cookie)); }, []);
  const t = (text: string) => translateUI(locale, text);
  return <html lang={locale} dir={localeDirection(locale)}><body><main>
    <h1>{t('صار خطأ غير متوقع')}</h1>
    <p>{t('جرّب إعادة تحميل المحتوى. إذا استمرت المشكلة فالمشكلة غالبًا مؤقتة.')}</p>
    <button type="button" onClick={reset}>{t('إعادة المحاولة')}</button>
  </main></body></html>;
}
