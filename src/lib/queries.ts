import 'server-only';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { cache } from 'react';
import { applications } from '@/lib/db/schema';
import { getDb } from '@/lib/db';
import { searchCatalog } from '@/lib/search/service';
import { getCatalogDetails } from '@/lib/catalog/metadata';
import { isGame, appName, GAME_CATEGORY_PATTERN } from '@/components/catalog/presentation';
import { normalizeSearch } from '@/lib/search/normalize';

export type Application = typeof applications.$inferSelect;

export interface SitemapApp {
  id: number;
  createdAt: Date | null;
  name: string | null;
  category: string | null;
}

export interface CategorySummary {
  category: string;
  count: number;
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

export const getApps = cache(
  async ({ q, category, page = 1, limit = 12 }: GetAppsParams): Promise<GetAppsResult> => {
    const db = getDb();
    if (!db) {
      return { items: [], total: 0, totalPages: 0, currentPage: 1 };
    }

    const safeLimit = Math.min(48, Math.max(1, Math.floor(Number(limit) || 12)));
    const rawPage = Math.min(10000, Math.max(1, Math.floor(Number(page) || 1)));

    const conditions = [eq(applications.active, true), eq(applications.published, true)];

    const search=q?.trim();
    if(search) {
      const ranked=await searchCatalog(search);
      if(!ranked.length)return {items:[],total:0,totalPages:1,currentPage:1};
      const rows=await db.select().from(applications).where(and(
        eq(applications.active,true),eq(applications.published,true),
        sql`${applications.id} IN (${sql.join(ranked.map(item=>sql`${item.id}`),sql`, `)})`,
        ...(category?.trim()?[eq(applications.category,category.trim())]:[]),
      ));
      const byId=new Map(rows.map(row=>[row.id,row]));
      const ordered=ranked.map(item=>byId.get(item.id)).filter((item):item is Application=>Boolean(item));
      const total=ordered.length,totalPages=Math.max(1,Math.ceil(total/safeLimit)),currentPage=Math.min(rawPage,totalPages);
      return {items:ordered.slice((currentPage-1)*safeLimit,currentPage*safeLimit),total,totalPages,currentPage};
    }

    if (category?.trim()) {
      conditions.push(eq(applications.category, category.trim()));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
    if (!db || !Number.isInteger(id) || id <= 0 || id > 2147483647) return undefined;

    const rows = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, id), eq(applications.active, true), eq(applications.published, true)))
      .limit(1);

    return rows[0];
  },
);

export const getRelatedApps = cache(
  async (appId:number, category?:string|null, limit=4):Promise<Application[]>=>{
    const db=getDb(),source=await getAppById(appId);
    if(!db||!source)return [];
    const conditions=[];
    if(category?.trim())conditions.push(eq(applications.category,category));
    if(source.developer?.trim())conditions.push(eq(applications.developer,source.developer));
    if(!conditions.length)return [];
    const candidates=await db.select().from(applications).where(and(
      eq(applications.active,true),eq(applications.published,true),sql`${applications.id} <> ${appId}`,or(...conditions),
    )).limit(100);
    const tags=new Set(getCatalogDetails(appId).tags?.map(normalizeSearch)||[]);
    const words=new Set(normalizeSearch(appName(source)).split(' ').filter(word=>word.length>2));
    return candidates.filter(app=>isGame(app)===isGame(source)).map(app=>({app,score:
      (app.category===source.category?40:0)+(source.developer&&app.developer===source.developer?30:0)
      +(getCatalogDetails(app.id).tags||[]).filter(tag=>tags.has(normalizeSearch(tag))).length*20
      +normalizeSearch(appName(app)).split(' ').filter(word=>words.has(word)).length*5,
    })).sort((a,b)=>b.score-a.score || (b.app.downloads||0)-(a.app.downloads||0) || a.app.id-b.app.id)
      .slice(0,Math.min(8,Math.max(1,limit))).map(item=>item.app);
  },
);

export const getCategories = cache(async (): Promise<string[]> => {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .selectDistinct({ category: applications.category })
    .from(applications)
    .where(and(eq(applications.active, true), eq(applications.published, true), sql`btrim(${applications.category}) <> ''`))
    .orderBy(applications.category);

  return rows
    .map((row) => row.category)
    .filter((value): value is string => typeof value === 'string');
});

export const getAllAppsSitemap = cache(async (): Promise<SitemapApp[]> => {
  const db = getDb();
  if (!db) return [];

  return db
    .select({ id: applications.id, name: applications.name, category: applications.category, createdAt: applications.createdAt })
    .from(applications)
    .where(and(eq(applications.active, true), eq(applications.published, true)))
    .orderBy(desc(applications.id));
});

/** Same classification as presentation, with only one page hydrated from PostgreSQL. */
export const getCatalogPage=cache(async (kind:'apps'|'games',page:number) => {
  const db=getDb();
  if(!db)return {items:[] as SitemapApp[],total:0,totalPages:1,currentPage:page};
  const game=sql`coalesce(${applications.category},'') ~* ${GAME_CATEGORY_PATTERN}`;
  const where=and(eq(applications.active,true),eq(applications.published,true),kind==='games'?game:sql`NOT (${game})`);
  const [{value}]=await db.select({value:count()}).from(applications).where(where);
  const total=Number(value),totalPages=Math.max(1,Math.ceil(total/24));
  const items=page>totalPages?[]:await db.select({id:applications.id,name:applications.name,category:applications.category,createdAt:applications.createdAt})
    .from(applications).where(where).orderBy(desc(applications.id)).limit(24).offset((page-1)*24);
  return {items,total,totalPages,currentPage:page};
});


export const getCategorySummaries = cache(async (): Promise<CategorySummary[]> => {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({ category: applications.category, count: count() })
    .from(applications)
    .where(and(eq(applications.active, true), eq(applications.published, true), sql`btrim(${applications.category}) <> ''`))
    .groupBy(applications.category)
    .orderBy(applications.category);

  return rows
    .filter((row): row is typeof row & { category: string } => typeof row.category === 'string')
    .map((row) => ({ category: row.category, count: Number(row.count) || 0 }));
});
