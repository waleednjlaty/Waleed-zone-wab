export const SITE_NAME = 'WALEED ZONE';

export const SITE_DESCRIPTION =
  'WALEED ZONE — مكتبة تحميل أحدث التطبيقات والألعاب والأدوات المجانية مباشرة أو عبر تيليجرام.';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

export const TELEGRAM_BOT_URL = 'https://t.me/WALEED_ZONE_BOT';

export function telegramDownloadUrl(id: number | string): string {
  return `${TELEGRAM_BOT_URL}?start=app_${id}`;
}
