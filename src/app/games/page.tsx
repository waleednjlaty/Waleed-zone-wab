import { Suspense } from 'react';
import CatalogSkeleton from '@/components/CatalogSkeleton';
import {schedulePageMetric} from '@/lib/analytics/schedule';
import CatalogLanding from '@/components/catalog/CatalogLanding';
import { getLanding, landingMetadata } from '@/lib/catalog/landing';
import { parsePage } from '@/lib/utils';

export const dynamic = 'force-dynamic';
interface Props { searchParams: Promise<{ page?: string | string[] }> }
export async function generateMetadata({ searchParams }: Props) {
  return landingMetadata('games', parsePage((await searchParams).page));
}
export default function GamesPage(props: Props) {
  return <Suspense fallback={<CatalogSkeleton />}><CatalogPageContent {...props} /></Suspense>;
}
async function CatalogPageContent({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  await getLanding('games', page);
  await schedulePageMetric('catalog_view',null,'/games');
  return <CatalogLanding kind="games" page={page} />;
}
