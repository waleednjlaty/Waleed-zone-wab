
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import {schedulePageMetric} from '@/lib/analytics/schedule';
import { notFound } from 'next/navigation';
import DownloadExperience from '@/components/download/DownloadExperience';
import LegacyDownloadExperience from '@/components/download/LegacyDownloadExperience';
import { getDownloadPresentation, getFallbackDelivery } from '@/components/download/presentation';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { getAppById } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return { title: t("التحميل المباشر"), robots: { index: false, follow: false }, referrer: 'same-origin' }; }

export default async function DownloadPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) notFound();
  const app = await getAppById(Number(id));
  if (!app) notFound();
  const file = await getDownloadPresentation(app.id);
  const fallback = file ? null : await getFallbackDelivery(app.id);
  await schedulePageMetric('download_page_view',app.id,`/download/${app.id}`);
  const summary = { id: app.id, name: appName(app,locale), imageUrl: app.imageUrl, detailHref: appHref(app), version: app.version, size: app.size };
  if (fallback) return <LegacyDownloadExperience app={summary} provider={fallback} />;
  return <DownloadExperience app={{ id: app.id, name: appName(app,locale), imageUrl: app.imageUrl,
    detailHref: appHref(app), version: app.version, size: app.size }} file={file} />;
}
