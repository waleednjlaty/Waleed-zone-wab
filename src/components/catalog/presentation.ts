import type { Application } from '@/lib/queries';

// Presentation only: the bot's schema and existing queries remain the source of truth.
export const GAME_CATEGORY_PATTERN = 'games?|gaming|ألعاب|العاب|لعبة|اكشن|أكشن|مغامرات|سباق|محاكاة|استراتيجية|رياضة|ألغاز|الغاز|arcade|action|adventure|racing|simulation|strategy|puzzle|role.?playing';
const gameCategory = new RegExp(GAME_CATEGORY_PATTERN,'i');

export function isGame(app: Pick<Application, 'category'>) {
  return gameCategory.test(app.category || '');
}

export function appName(app: Pick<Application, 'name' | 'id'>) {
  return app.name?.trim().replace(/\.(apk|xapk|apks|zip|exe)$/i, '').replace(/_/g, ' ') || `تطبيق ${app.id}`;
}

export function appMetadata(app: Pick<Application, 'version' | 'size' | 'platform'>) {
  const available = (value: string | null) => {
    const text = value?.trim();
    return text && !/^[-–—.]+$/.test(text) ? text : null;
  };
  const version = available(app.version);
  return [version ? (/^\d/.test(version) ? `v${version}` : version) : null, available(app.size), available(app.platform)].filter(Boolean).join(' · ');
}

export type SearchSuggestion = Pick<Application, 'id' | 'name' | 'category' | 'imageUrl'>;

export function homeCollections(apps: Application[]) {
  const ranked = [...apps];
  const hasDownloads = apps.some(app => (app.downloads || 0) > 0);
  const hasViews = apps.some(app => (app.views || 0) > 0);
  // Don't compare downloads to views. Use a consistent metric for this collection.
  if (hasDownloads) ranked.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  else if (hasViews) ranked.sort((a, b) => (b.views || 0) - (a.views || 0));
  return {
    trending: ranked.slice(0, 6),
    trendingLabel: hasDownloads ? 'الأكثر تحميلًا من آخر الإضافات' : hasViews ? 'الأكثر مشاهدة من آخر الإضافات' : 'اكتشف أحدث الإضافات',
    latest: apps.filter(app => app.version).slice(0, 6),
    games: apps.filter(isGame).slice(0, 3),
    apps: apps.filter(app => !isGame(app)).slice(0, 6),
  };
}
