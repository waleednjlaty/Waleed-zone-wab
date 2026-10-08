'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, type Locale } from '@/lib/locale';
import { useLocale } from './LocaleProvider';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending,startTransition] = useTransition();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  const label = locale === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic';

  function switchLanguage() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'en' ? 'ltr' : 'rtl';
    startTransition(() => router.refresh());
  }

  return <button type="button" className="icon-button language-switcher" disabled={pending} aria-busy={pending} aria-label={label} title={label} onClick={switchLanguage}>
    <span aria-hidden="true">{locale === 'ar' ? 'EN' : 'AR'}</span>
  </button>;
}
