import CatalogLanding from '@/components/catalog/CatalogLanding';
import { getLanding, landingMetadata } from '@/lib/catalog/landing';
import { parsePage } from '@/lib/utils';

export const dynamic = 'force-dynamic';
interface Props { searchParams: Promise<{ page?: string | string[] }> }
export async function generateMetadata({ searchParams }: Props) {
  return landingMetadata('games', parsePage((await searchParams).page));
}
export default async function GamesPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  await getLanding('games', page);
  return <CatalogLanding kind="games" page={page} />;
}
