import { DownloadError } from '@/lib/downloads/rules';
import { downloadHeaders } from '@/lib/downloads/http';
import { localeFromCookie, localeDirection } from '@/lib/locale';
/** Same-origin retry form only. Never contains a provider destination or supplied error text. */
export function providerRetry(error: unknown, applicationId: number, token: unknown, request?: Request): Response | null {
  if (!(error instanceof DownloadError) || !['PROVIDER_UNAVAILABLE','PROVIDER_CHALLENGE','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMITED','PROVIDER_BUSY','BZZHR_NOT_FOUND','INVALID_PROVIDER_RESPONSE'].includes(error.code)
    || !Number.isSafeInteger(applicationId) || applicationId < 1 || applicationId > 2147483647
    || typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const locale = localeFromCookie(request?.headers.get('cookie')), en = locale === 'en';
  const messages: Record<string, string> = en ? {
    PROVIDER_CHALLENGE: 'The source temporarily requires human verification.',
    PROVIDER_TIMEOUT: 'The source connection timed out.',
    BZZHR_NOT_FOUND: 'A download source was not found for this game.',
    PROVIDER_RATE_LIMITED: 'The source is receiving too many requests.',
  } : {
    PROVIDER_CHALLENGE: 'المصدر يطلب تحققًا بشريًا مؤقتًا.',
    PROVIDER_TIMEOUT: 'انتهت مهلة الاتصال بالمصدر.',
    BZZHR_NOT_FOUND: 'لم يُعثر على BZZHR لهذه اللعبة.',
    PROVIDER_RATE_LIMITED: 'المصدر مشغول بطلبات كثيرة.',
  };
  const title = en ? 'Unable to prepare the source' : 'تعذر تجهيز المصدر';
  const message = messages[error.code] || (en ? 'The download source is temporarily unavailable.' : 'مزود التحميل غير متاح مؤقتًا.');
  const instructions = en ? 'Wait briefly and try again. The request allows three attempts before it expires.' : 'انتظر قليلًا ثم أعد المحاولة. يسمح الطلب بثلاث محاولات خلال صلاحيته.';
  return new Response(`<!doctype html><html lang="${locale}" dir="${localeDirection(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message} ${instructions}</p><form action="/api/downloads/legacy/redeem" method="post"><input type="hidden" name="application_id" value="${applicationId}"><input type="hidden" name="token" value="${token}"><button type="submit">${en ? 'Retry safely' : 'إعادة المحاولة بأمان'}</button></form><a href="/download/${applicationId}">${en ? 'Prepare a new request' : 'تجهيز طلب جديد'}</a></main></body></html>`, {
    status: error.status, headers: { ...downloadHeaders, 'Retry-After': '10', 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}
