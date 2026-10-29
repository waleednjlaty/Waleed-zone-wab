import type { Application } from '@/lib/queries';
import type { Locale } from '@/lib/locale';

// Presentation only: the bot's schema and existing queries remain the source of truth.
export const GAME_CATEGORY_PATTERN = 'games?|gaming|ألعاب|العاب|لعبة|اكشن|أكشن|مغامرات|سباق|محاكاة|استراتيجية|رياضة|ألغاز|الغاز|arcade|action|adventure|racing|simulation|strategy|puzzle|role.?playing';
const gameCategory = new RegExp(GAME_CATEGORY_PATTERN,'i');

export function isGame(app: Pick<Application, 'category'>) {
  return gameCategory.test(app.category || '');
}

export function appName(app: Pick<Application, 'name' | 'id'>, locale: Locale = 'ar') {
  return app.name?.trim().replace(/\.(apk|xapk|apks|zip|exe)$/i, '').replace(/_/g, ' ') || (locale === 'en' ? `App ${app.id}` : `تطبيق ${app.id}`);
}

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  'مونتاج': 'Video editing', 'تحرير الفيديو': 'Video editing', 'تعديل الفيديو': 'Video editing',
  'تواصل اجتماعي': 'Social networking', 'وسائل التواصل الاجتماعي': 'Social networking',
  'ألعاب كمبيوتر': 'PC games', 'العاب كمبيوتر': 'PC games', 'ألعاب أندرويد': 'Android games',
  'ألعاب': 'Games', 'العاب': 'Games', 'لعبة': 'Games', 'أدوات': 'Tools', 'أداة': 'Tools',
  'تصميم': 'Design', 'تصوير': 'Photography', 'فيديو': 'Video', 'موسيقى وصوت': 'Music & audio',
  'تعليم': 'Education', 'إنتاجية': 'Productivity', 'اتصال': 'Communication', 'ترفيه': 'Entertainment',
  'أعمال': 'Business', 'كتب ومراجع': 'Books & reference', 'رياضة': 'Sports', 'أخبار': 'News',
  'طقس': 'Weather', 'صحة ولياقة': 'Health & fitness', 'مال وأعمال': 'Finance',
  'تخصيص': 'Personalization', 'خرائط وتنقل': 'Maps & navigation', 'مجانية': 'Free apps',
};

export function localizeCategory(value: string | null | undefined, locale: Locale): string {
  const category = value?.trim();
  if (!category) return locale === 'en' ? 'Library' : 'المكتبة';
  const key = category.toLocaleLowerCase();
  if (locale === 'en') {
    const match = Object.entries(CATEGORY_TRANSLATIONS).find(([ar]) => ar.toLocaleLowerCase() === key);
    if (match) return match[1];
    if (/[\u0600-\u06FF]/.test(category)) return 'Other';
    return category;
  }
  const reverse = Object.entries(CATEGORY_TRANSLATIONS).find(([, en]) => en.toLocaleLowerCase() === key);
  if (reverse) return reverse[0];
  if (/[A-Za-z]/.test(category) && !/[\u0600-\u06FF]/.test(category)) return 'أخرى';
  return category;
}

/**
 * Catalog descriptions are user-entered database content, not UI strings.
 * Until a translated description is stored, avoid showing a paragraph in the
 * wrong language; use a clear localized fallback instead.
 */
export function localizeDescription(value: string | null | undefined, locale: Locale, kind: 'app' | 'game' = 'app'): string {
  const description = value?.replace(/\s+/g, ' ').trim();
  if (!description) return locale === 'en'
    ? 'Explore the details, version information and available download options.'
    : kind === 'game' ? 'اكتشف تفاصيل اللعبة وإصدارها وخيارات التحميل المتاحة.' : 'اكتشف تفاصيل التطبيق وإصداره وخيارات التحميل المتاحة.';
  const hasArabic = /[\u0600-\u06FF]/.test(description);
  const hasLatin = /[A-Za-z]/.test(description);
  if (locale === 'en' && hasArabic) return kind === 'game'
    ? 'Explore this game, its available version and download details.'
    : 'Explore this app, its available version and download details.';
  if (locale === 'ar' && hasLatin && !hasArabic) return kind === 'game'
    ? 'اكتشف تفاصيل اللعبة وإصدارها وخيارات التحميل المتاحة.'
    : 'اكتشف تفاصيل التطبيق وإصداره وخيارات التحميل المتاحة.';
  return description;
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
    latest: apps.filter(app => app.version).slice(0, 6),
    games: apps.filter(isGame).slice(0, 3),
    apps: apps.filter(app => !isGame(app)).slice(0, 6),
  };
}
