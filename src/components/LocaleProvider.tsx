'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { translateUI } from '@/lib/ui-translations';
import type { Locale } from '@/lib/locale';

const LocaleContext = createContext<Locale>('ar');

export default function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslateUI() {
  const locale = useLocale();
  return useCallback((text: string, ...values: unknown[]) => translateUI(locale, text, ...values), [locale]);
}
