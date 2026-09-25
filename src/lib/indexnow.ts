import { SITE_URL } from '@/lib/site';

export const INDEXNOW_KEY = '182a99ea9155305109b7bac7d1bdbd95';

export function normalizeIndexNowUrls(inputs: string[]): string[] {
  const origin = new URL(SITE_URL);
  const urls = new Set<string>();

  for (const input of inputs.slice(0, 10000)) {
    try {
      const url = new URL(input, origin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      if (url.host !== origin.host) continue;
      url.hash = '';
      urls.add(url.toString());
    } catch {
      // Ignore malformed URLs rather than forwarding them to IndexNow.
    }
  }

  return [...urls];
}

export async function submitIndexNow(inputs: string[]): Promise<{
  submitted: number;
  status: number;
}> {
  const urls = normalizeIndexNowUrls(inputs);
  if (urls.length === 0) return { submitted: 0, status: 204 };

  const origin = new URL(SITE_URL);
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: origin.host,
      key: INDEXNOW_KEY,
      keyLocation: origin.origin + '/182a99ea9155305109b7bac7d1bdbd95.txt',
      urlList: urls,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('IndexNow rejected submission with HTTP ' + response.status);
  }

  return { submitted: urls.length, status: response.status };
}
