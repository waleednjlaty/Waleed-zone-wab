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
