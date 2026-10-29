import 'server-only';

import type { Locale } from '@/lib/locale';

const CACHE_SECONDS = 60 * 60 * 24 * 30;
const MAX_DESCRIPTION_LENGTH = 12_000;
const CHUNK_LENGTH = 500;

function normalizeText(value: string): string {
  return value.replace(/\\s+/g, ' ').trim();
}

function chunksFor(text: string): string[] {
  const result: string[] = [];
  let remaining = text;
  while (remaining.length > CHUNK_LENGTH) {
    let cut = remaining.lastIndexOf(' ', CHUNK_LENGTH);
    if (cut < Math.floor(CHUNK_LENGTH / 2)) cut = CHUNK_LENGTH;
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

function extractGoogleTranslation(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) return null;
  const translated = payload[0]
    .map((segment: unknown) => Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '')
    .join('')
    .trim();
  return translated || null;
}

async function googleTranslate(text: string, target: 'ar' | 'en'): Promise<string | null> {
  const chunks = chunksFor(text);
  const translated: string[] = [];
  for (const chunk of chunks) {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'auto');
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', chunk);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'WaleedZone/1.0 (catalog translation)' },
        next: { revalidate: CACHE_SECONDS },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) return null;
      const result = extractGoogleTranslation(await response.json());
      if (!result) return null;
      translated.push(result);
    } catch {
      return null;
    }
  }
  return translated.join(' ').trim() || null;
}

async function libreTranslate(text: string, target: 'ar' | 'en'): Promise<string | null> {
  try {
    const response = await fetch('https://libretranslate.de/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ q: text, source: 'auto', target, format: 'text' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('translatedText' in payload)) return null;
    const result = (payload as { translatedText?: unknown }).translatedText;
    return typeof result === 'string' && result.trim() ? result.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Translates catalog-authored descriptions only when their script does not match
 * the visitor's selected locale. Successful GET translations are cached by Next.js
 * for 30 days so a public translation endpoint isn't called on each page view.
 */
export async function localizeCatalogDescription(
  value: string | null | undefined,
  locale: Locale,
  kind: 'app' | 'game' = 'app',
): Promise<string> {
  const original = normalizeText(value || '');
  if (!original) {
    return locale === 'en'
      ? kind === 'game'
        ? 'Explore this game, its available version and download details.'
        : 'Explore this app, its available version and download details.'
      : kind === 'game'
        ? 'اكتشف تفاصيل اللعبة وإصدارها وخيارات التحميل المتاحة.'
        : 'اكتشف تفاصيل التطبيق وإصداره وخيارات التحميل المتاحة.';
  }

  const hasArabic = /[\\u0600-\\u06FF]/.test(original);
  const hasLatin = /[A-Za-z]/.test(original);
  const needsTranslation = locale === 'en' ? hasArabic : hasLatin && !hasArabic;
  if (!needsTranslation) return original;

  const bounded = original.slice(0, MAX_DESCRIPTION_LENGTH);
  const target = locale === 'en' ? 'en' : 'ar';
  const google = await googleTranslate(bounded, target);
  const result = google || await libreTranslate(bounded, target);

  // Never replace a real app description with a generic placeholder if a
  // translation provider is temporarily unavailable.
  if (!result) return original;
  return original.length > MAX_DESCRIPTION_LENGTH ? `${result}…` : result;
}
