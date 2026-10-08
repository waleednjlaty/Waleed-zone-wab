
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import { safeExternalUrl } from '@/lib/utils';
export default async function Screenshots({images,name}:{images:{url:string;alt?:string}[];name:string}) {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  return <section className="detail-section" aria-labelledby="screenshots-title"><h2 id="screenshots-title">{t("لقطات الشاشة")}</h2><p className="detail-subtitle">{t("اسحب لاستكشاف الصور")}</p><div className="screenshot-carousel" tabIndex={0} role="region" aria-label={t("لقطات شاشة {0}", name)}>
    {images.map((image,index)=><figure key={`${image.url}-${index}`}><img src={safeExternalUrl(image.url)!} alt={image.alt||t("لقطة شاشة {0} من {1}", index+1, name)} loading="lazy" decoding="async" referrerPolicy="no-referrer"/></figure>)}
  </div></section>;
}
