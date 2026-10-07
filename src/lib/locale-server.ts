import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './locale';

export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
});
