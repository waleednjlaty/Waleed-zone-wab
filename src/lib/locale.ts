export type Locale = 'ar' | 'en';

export const DEFAULT_LOCALE: Locale = 'ar';
export const LOCALE_COOKIE = 'wz_locale';

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'ar';
}

export function localeDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'en' ? 'ltr' : 'rtl';
}

export function localeTag(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'ar-SY';
}

/** Only one exact, bounded locale cookie is accepted; malformed preferences default to Arabic. */
export function localeFromCookie(header: string | null | undefined): Locale {
  const values = (header || '').split(';').map(value => value.trim()).filter(value => value.startsWith(LOCALE_COOKIE + '='));
  return values.length === 1 ? normalizeLocale(values[0].slice(LOCALE_COOKIE.length + 1)) : DEFAULT_LOCALE;
}
