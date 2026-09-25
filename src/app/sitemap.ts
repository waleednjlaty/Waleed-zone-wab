import type { MetadataRoute } from 'next';
import { getAllAppsSitemap, getCategories } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';
import { categoryPath } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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
    lastModified: app.createdAt ?? undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryUrls: MetadataRoute.Sitemap = categories.map((category) => ({
    url: SITE_URL + categoryPath(category),
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: SITE_URL + '/popular',
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: SITE_URL + '/about',
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: SITE_URL + '/privacy',
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    ...categoryUrls,
    ...appUrls,
  ];
}
