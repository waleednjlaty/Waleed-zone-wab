'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from '@/lib/locale';

const LocaleContext = createContext<Locale>('ar');

export default function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
