import type { MetadataRoute } from 'next';
import { getAllAppsSitemap, getCategories } from '@/lib/queries';
import { appHref } from '@/lib/catalog/routes';
import { SITE_URL } from '@/lib/site';
import { isGame } from '@/components/catalog/presentation';

export const dynamic='force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let apps: Awaited<ReturnType<typeof getAllAppsSitemap>> = [];
  let categories: string[] = [];

  try {
    [apps, categories] = await Promise.all([getAllAppsSitemap(), getCategories()]);
  } catch {
    apps = [];
    categories = [];
  }

  const appUrls: MetadataRoute.Sitemap = apps.map((app) => ({
    url: new URL(appHref(app),SITE_URL).href,
    ...(app.createdAt ? { lastModified: app.createdAt } : {}),
  }));

  const categoryUrls: MetadataRoute.Sitemap = categories.map((category) => ({
    url: SITE_URL + '/category/' + encodeURIComponent(category),
  }));

  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/about` },
    ...(apps.some(app => !isGame(app)) ? [{ url: `${SITE_URL}/apps` }] : []),
    ...(apps.some(isGame) ? [{ url: `${SITE_URL}/games` }] : []),
    ...categoryUrls,
    ...appUrls,
  ];
}
