// Loaded ONLY by the disposable frontend test harness, never a production route.
import DownloadExperience from '@/components/download/DownloadExperience';
import DownloadActions from '@/components/details/DownloadActions';
import type { DownloadFile } from '@/components/download/types';

export default async function Fixture({ searchParams }: { searchParams: Promise<{ unavailable?: string; actions?: string }> }) {
  const query = await searchParams;
  const file: DownloadFile = { application_id: 201, version_id: '11111111-1111-4111-8111-111111111111', file_id: '22222222-2222-4222-8222-222222222222', version: '9.1', size_bytes: 85000000, file_type: 'apk' };
  const app = { id: 201, name: 'WhatsApp', imageUrl: null, detailHref: '/apps/whatsapp-201', version: '9.1', size: '85 MB' };
  return query.actions ? <div className="shell detail-page"><h1>WhatsApp</h1><DownloadActions name={app.name} appId={app.id} imageUrl={null} size="85 MB" href="https://example.test/legacy" external initialSaved={false} signedIn={false} directFile={query.unavailable ? null : file} /><div style={{ height: 1600 }} /></div> : <DownloadExperience app={app} file={query.unavailable ? null : file} />;
}
