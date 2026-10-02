import Skeleton from '@/components/loading/Skeleton';
import LoadingRegion from '@/components/loading/LoadingRegion';

/** Unknown page data only; never rendered by the download lifecycle/countdown. */
export default function DownloadLoading() {
  return <LoadingRegion label="جارٍ تحميل معلومات الملف" className="shell py-8">
    <Skeleton style={{ width: '60%', height: 32, marginBottom: 24 }} />
    <div className="grid gap-4 md:grid-cols-2"><div className="card-skeleton p-6 flex gap-4"><Skeleton style={{ width: 60, height: 60, flexShrink: 0 }} /><div className="flex-1 space-y-4"><Skeleton style={{ width: '80%', height: 20 }} /><Skeleton style={{ width: '60%', height: 16 }} /></div></div><div className="card-skeleton p-6 space-y-6"><Skeleton style={{ height: 24, width: '70%' }} /><Skeleton style={{ height: 120, width: '100%' }} /></div></div>
  </LoadingRegion>;
}
