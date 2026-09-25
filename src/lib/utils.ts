export function sanitizeSearch(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100);
}

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function parsePage(input?: string | string[] | number): number {
  const value = Array.isArray(input) ? input[0] : input;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

export function formatDate(input?: Date | string | null): string | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function safeHttpUrl(input?: string | null): string | undefined {
  if (!input) return undefined;

  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function categoryPath(category: string): string {
  return `/category/${encodeURIComponent(category.trim())}`;
}

export function decodePathSegment(input: string): string {
  try {
    return decodeURIComponent(input).trim();
  } catch {
    return input.trim();
  }
}
