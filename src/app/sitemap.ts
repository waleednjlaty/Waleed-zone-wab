import type { MetadataRoute } from 'next';
import { getAllAppsSitemap, getCategories } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';

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
    url: SITE_URL + '/app/' + app.id,
    ...(app.createdAt ? { lastModified: app.createdAt } : {}),
  }));

  const categoryUrls: MetadataRoute.Sitemap = categories.map((category) => ({
    url: SITE_URL + '/category/' + encodeURIComponent(category),
  }));

  return [
    { url: SITE_URL },
    ...categoryUrls,
    ...appUrls,
  ];
}
