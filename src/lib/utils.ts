export function sanitizeSearch(input: string): string {
  return input
    .slice(0, 1000)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 100);
}

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function parsePage(input?: string | string[] | number): number {
  const value = Array.isArray(input) ? input[0] : input;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function safeExternalUrl(value?: string | null): string | null {
  if (!value || value.length>2000 || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !/(^|\.)telegram\.org$/i.test(url.hostname)
      && !/^(?:localhost|.*\.(?:localhost|local|internal)|[\d.]+|\[.*\])$/i.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function formatDate(input?: Date | string | null, locale: 'ar' | 'en' = 'ar'): string | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
