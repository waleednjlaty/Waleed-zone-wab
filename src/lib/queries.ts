import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { cache } from 'react';
import { applications } from '@/lib/db/schema';
import { getDb } from '@/lib/db';
import { escapeLike } from '@/lib/utils';

export type Application = typeof applications.$inferSelect;

export interface SitemapApp {
  id: number;
  createdAt: Date | null;
}

export interface GetAppsParams {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface GetAppsResult {
  items: Application[];
  total: number;
  totalPages: number;
  currentPage: number;
}

const publicAppConditions = [
  eq(applications.active, true),
  eq(applications.published, true),
];

export const getApps = cache(
  async ({ q, category, page = 1, limit = 12 }: GetAppsParams): Promise<GetAppsResult> => {
    const db = getDb();
    if (!db) {
      return { items: [], total: 0, totalPages: 0, currentPage: 1 };
    }

    const safeLimit = Math.min(48, Math.max(1, Math.floor(Number(limit) || 12)));
    const rawPage = Math.max(1, Math.floor(Number(page) || 1));
    const conditions = [...publicAppConditions];

    const search = q?.trim();
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(
        or(
          ilike(applications.name, pattern),
          ilike(applications.category, pattern),
          ilike(applications.platform, pattern),
        )!,
      );
    }

    if (category?.trim()) {
      conditions.push(eq(applications.category, category.trim()));
    }

    const where = and(...conditions);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(applications)
      .where(where);

    const totalCount = Number(total) || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / safeLimit));
    const currentPage = Math.min(rawPage, totalPages);

    const items =
      totalCount > 0
        ? await db
            .select()
            .from(applications)
            .where(where)
            .orderBy(desc(applications.id))
            .limit(safeLimit)
            .offset((currentPage - 1) * safeLimit)
        : [];

    return { items, total: totalCount, totalPages, currentPage };
  },
);

export const getAppById = cache(
  async (id: number): Promise<Application | undefined> => {
    const db = getDb();
    if (!db || !Number.isInteger(id) || id <= 0) return undefined;

    const rows = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.id, id),
          eq(applications.active, true),
          eq(applications.published, true),
        ),
      )
      .limit(1);

    return rows[0];
  },
);

export const getRelatedApps = cache(
  async (appId: number, category?: string | null, limit = 4): Promise<Application[]> => {
    const db = getDb();
    if (!db || !category) return [];

    return db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.active, true),
          eq(applications.published, true),
          eq(applications.category, category),
          sql`${applications.id} <> ${appId}`,
        ),
      )
      .orderBy(desc(applications.id))
      .limit(Math.min(8, Math.max(1, limit)));
  },
);

export const getCategories = cache(async (): Promise<string[]> => {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .selectDistinct({ category: applications.category })
    .from(applications)
    .where(
      and(
        eq(applications.active, true),
        eq(applications.published, true),
        sql`btrim(${applications.category}) <> ''`,
      ),
    )
    .orderBy(applications.category);

  return rows
    .map((row) => row.category)
    .filter((value): value is string => typeof value === 'string');
});

export const getAllAppsSitemap = cache(async (): Promise<SitemapApp[]> => {
  const db = getDb();
  if (!db) return [];

  return db
    .select({ id: applications.id, createdAt: applications.createdAt })
    .from(applications)
    .where(and(eq(applications.active, true), eq(applications.published, true)))
    .orderBy(desc(applications.id));
});
