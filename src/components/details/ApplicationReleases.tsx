import Link from 'next/link';
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import { appHref } from '@/lib/catalog/routes';
import { appName, appVersion } from '@/components/catalog/presentation';
import type { Application } from '@/lib/queries';

export default async function ApplicationReleases({ items, currentId }: { items: Application[]; currentId: number }) {
  const locale = await getLocale(), english = locale === 'en';
  const t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);
  if (items.length < 2) return null;

  return <section className="detail-section" aria-labelledby="app-releases-title">
    <h2 id="app-releases-title">{t("إصدارات التطبيق")}</h2>
    <p className="detail-subtitle">{t("اختر الإصدار المطلوب؛ لكل إصدار ملفه ورابط تحميله الخاص.")}</p>
    <ul className="versions-list">
      {items.map((release) => {
        const current = release.id === currentId;
        const version = appVersion(release) || (english ? "Version not specified" : "إصدار غير محدد");
        const metadata = [release.platform, release.size].filter(value => value?.trim()).join(" · ");
        return <li key={release.id}>
          <div>
            <strong dir="auto">{version}</strong>
            {current
              ? <span className="app-badge">{t("الإصدار المعروض")}</span>
              : <Link href={appHref(release)}>{t("عرض الإصدار")} ↗</Link>}
          </div>
          <p dir="auto">{[appName(release, locale), metadata].filter(Boolean).join(" · ")}</p>
        </li>;
      })}
    </ul>
  </section>;
}
