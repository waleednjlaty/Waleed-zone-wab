import { requireOwner } from '@/lib/authorization';
import OwnerCdnTest from '@/components/admin/OwnerCdnTest';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner CDN test | Waleed Zone', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function OwnerDownloadTestPage({ searchParams }: { searchParams: Promise<{ application_id?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  return <OwnerCdnTest initialId={typeof params.application_id === 'string' && /^[1-9][0-9]{0,9}$/.test(params.application_id) ? params.application_id : ''} />;
}
