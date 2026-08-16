import type { MetadataRoute } from 'next';
import { getAllAppsSitemap } from '@/lib/queries';
import { SITE_URL } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let apps: Awaited<ReturnType<typeof getAllAppsSitemap>> = [];
  try {
    apps = await getAllAppsSitemap();
  } catch {
    apps = [];
  }

  const appUrls: MetadataRoute.Sitemap = apps.map((app) => ({
    url: `${SITE_URL}/app/${app.id}`,
    lastModified: app.createdAt ?? undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...appUrls,
  ];
}
