import type { CatalogVersion } from '@/lib/catalog/metadata';
import { formatDate } from '@/lib/utils';
export default function Versions({items}:{items:CatalogVersion[]}) {
  return <section className="detail-section" aria-labelledby="versions-title"><h2 id="versions-title">الإصدارات السابقة</h2>{items.length===0&&<p className="detail-subtitle">لا تتوفر إصدارات سابقة منشورة لهذا المحتوى حاليًا.</p>}<ul className="versions-list">{items.map((item,index)=><li key={`${item.version}-${index}`}><div><strong dir="auto">{item.version}</strong>{item.releaseDate&&formatDate(item.releaseDate)&&<time dateTime={item.releaseDate}>{formatDate(item.releaseDate)}</time>}</div><p dir="auto">{[item.size,item.android,item.architecture].filter(Boolean).join(' · ')}</p></li>)}</ul></section>;
}
