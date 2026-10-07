export const SITE_NAME = 'Waleed Zone';
export const SITE_ARABIC_NAME = 'وليد زون';
export const HOME_TITLE = 'Waleed Zone | وليد زون — تطبيقات وألعاب';
export const HOME_TITLE_EN = 'Waleed Zone — Apps & Games';

export const SITE_DESCRIPTION =
  'اكتشف تطبيقات وألعاب وليد زون (Waleed Zone)، وتصفح تفاصيل الإصدارات والأحجام والمنصات وروابط التحميل، مع البحث بالعربية والإنجليزية.';

export const SITE_DESCRIPTION_EN =
  'Discover apps and games on Waleed Zone, browse release details, file sizes, platforms and download options, and search in Arabic or English.';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://waleed-zone.up.railway.app';

export const TELEGRAM_BOT_URL = 'https://t.me/WALEED_ZONE_BOT';
export const TELEGRAM_CHANNEL_URL = 'https://t.me/Waleed_Zone';

export function telegramDownloadUrl(id: number | string): string {
  return `${TELEGRAM_BOT_URL}?start=app_${id}`;
}
