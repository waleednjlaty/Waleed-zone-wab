import type { Application } from '@/lib/queries';
import type { Locale } from '@/lib/locale';

// Presentation only: the bot's schema and existing queries remain the source of truth.
export const GAME_CATEGORY_PATTERN = 'games?|gaming|ألعاب|العاب|لعبة|اكشن|أكشن|مغامرات|سباق|محاكاة|استراتيجية|رياضة|ألغاز|الغاز|arcade|action|adventure|racing|simulation|strategy|puzzle|role.?playing';
const gameCategory = new RegExp(GAME_CATEGORY_PATTERN,'i');

export function isGame(app: Pick<Application, 'category'>) {
  return gameCategory.test(app.category || '');
}

export function appName(app: Pick<Application, 'name' | 'id'>, locale: Locale = 'ar') {
  const cleaned = (app.name || '')
    .trim()
    .replace(/\.(apk|xapk|apks|aab|zip|exe|msi|dmg|ipa)$/i, '')
    .replace(/^\s*#?\d{1,3}[\s.)_-]+(?=[^\W\d_])/u, '')
    .replace(/(?:^|[\s_-])v?\d+(?:\.\d+){1,5}(?:[-+][\w.-]+)?(?=$|[\s_-])/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || (locale === 'en' ? `App ${app.id}` : `تطبيق ${app.id}`);
}

export function appVersion(app: Pick<Application, 'name' | 'version'>) {
  const explicit = app.version?.trim();
  if (explicit && !/^[-–—.]+$/.test(explicit)) return explicit;
  const match = (app.name || '').match(/(?:^|[\s_-])v?(\d+(?:\.\d+){1,5}(?:[-+][\w.-]+)?)(?=$|[\s_-])/i);
  return match?.[1] || null;
}

export function appMetadata(app: Pick<Application, 'name' | 'version' | 'size' | 'platform'>) {
  const available = (value: string | null) => {
    const text = value?.trim();
    return text && !/^[-–—.]+$/.test(text) ? text : null;
  };
  const version = available(appVersion(app));
  return [version ? (/^\d/.test(version) ? `v${version}` : version) : null, available(app.size), available(app.platform)].filter(Boolean).join(' · ');
}

export type SearchSuggestion = Pick<Application, 'id' | 'name' | 'category' | 'imageUrl'>;

export function homeCollections(apps: Application[], locale: Locale = 'ar') {
  const ranked = [...apps];
  const hasDownloads = apps.some(app => (app.downloads || 0) > 0);
  const hasViews = apps.some(app => (app.views || 0) > 0);
  // Don't compare downloads to views. Use a consistent metric for this collection.
  if (hasDownloads) ranked.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  else if (hasViews) ranked.sort((a, b) => (b.views || 0) - (a.views || 0));
  return {
    trending: ranked.slice(0, 6),
    trendingLabel: locale === 'en' ? (hasDownloads ? 'Most downloaded among recent additions' : hasViews ? 'Most viewed among recent additions' : 'Discover the latest additions') : (hasDownloads ? 'الأكثر تحميلًا من آخر الإضافات' : hasViews ? 'الأكثر مشاهدة من آخر الإضافات' : 'اكتشف أحدث الإضافات'),
    latest: apps.filter(app => appVersion(app)).slice(0, 6),
    games: apps.filter(isGame).slice(0, 3),
    apps: apps.filter(app => !isGame(app)).slice(0, 6),
  };
}
