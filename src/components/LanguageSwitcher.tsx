'use client';

import { useEffect, useState } from 'react';
import { LOCALE_COOKIE, type Locale } from '@/lib/locale';
import { useLocale } from './LocaleProvider';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  const label = locale === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic';

  function switchLanguage() {
    setPending(true);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'en' ? 'ltr' : 'rtl';
    // A fresh document prevents an in-flight RSC refresh from restoring the previous locale.
    // Same-origin session and favorite cookies remain untouched; the current URL is retained.
    window.location.reload();
  }

  return <button type="button" className="icon-button language-switcher" disabled={!hydrated || pending} aria-busy={!hydrated || pending} aria-label={label} title={label} onClick={switchLanguage}>
    <span aria-hidden="true">{locale === 'ar' ? 'EN' : 'AR'}</span>
  </button>;
}
