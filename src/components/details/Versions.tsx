
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import type { CatalogVersion } from '@/lib/catalog/metadata';
import { formatDate } from '@/lib/utils';
export default async function Versions({items}:{items:CatalogVersion[]}) {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  return <section className="detail-section" aria-labelledby="versions-title"><h2 id="versions-title">{t("الإصدارات السابقة")}</h2>{items.length===0&&<p className="detail-subtitle">{t("لا تتوفر إصدارات سابقة منشورة لهذا المحتوى حاليًا.")}</p>}<ul className="versions-list">{items.map((item,index)=><li key={`${item.version}-${index}`}><div><strong dir="auto">{item.version}</strong>{item.releaseDate&&formatDate(item.releaseDate, locale)&&<time dateTime={item.releaseDate}>{formatDate(item.releaseDate, locale)}</time>}</div><p dir="auto">{[item.size,item.android,item.architecture].filter(Boolean).join(' · ')}</p></li>)}</ul></section>;
}
