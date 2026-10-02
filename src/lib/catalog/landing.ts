import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getAllAppsSitemap } from '@/lib/queries';
import { isGame } from '@/components/catalog/presentation';
import { pageMetadata } from '@/lib/seo';

export type CatalogKind = 'apps' | 'games';
export const landingName = (kind: CatalogKind) => kind === 'games' ? 'ألعاب وليد زون' : 'تطبيقات وليد زون';
export const landingPath = (kind: CatalogKind, page: number) => `/${kind}${page > 1 ? `?page=${page}` : ''}`;

/** Read existing public catalog summaries; preserve the existing app/game classification. */
export const getLanding = cache(async (kind: CatalogKind, page: number) => {
  const all = (await getAllAppsSitemap()).filter(app => isGame(app) === (kind === 'games'));
  const totalPages = Math.max(1, Math.ceil(all.length / 24));
  if (page > totalPages) notFound();
  return { items: all.slice((page - 1) * 24, page * 24), total: all.length, totalPages, currentPage: page };
});

export async function landingMetadata(kind: CatalogKind, page: number) {
  const result = await getLanding(kind, page);
  const suffix = page > 1 ? ` — صفحة ${page}` : '';
  return pageMetadata(
    landingName(kind) + suffix,
    kind === 'games'
      ? `تصفح ألعاب وليد زون (Waleed Zone) وافتح تفاصيل كل لعبة لمعرفة الإصدار والمنصة وخيارات التحميل المتاحة.${suffix}`
      : `تصفح تطبيقات وليد زون (Waleed Zone) والأدوات المنشورة، وافتح تفاصيل كل تطبيق لمعرفة الإصدار والمنصة وخيارات التحميل.${suffix}`,
    landingPath(kind, page), { noindex: result.total === 0 },
  );
}
