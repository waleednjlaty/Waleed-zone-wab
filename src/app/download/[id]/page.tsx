import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DownloadExperience from '@/components/download/DownloadExperience';
import { getDownloadPresentation } from '@/components/download/presentation';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { getAppById } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'التحميل المباشر', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function DownloadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) notFound();
  const app = await getAppById(Number(id));
  if (!app) notFound();
  return <DownloadExperience app={{ id: app.id, name: appName(app), imageUrl: app.imageUrl,
    detailHref: appHref(app), version: app.version, size: app.size }} file={await getDownloadPresentation(app.id)} />;
}
