import { safeExternalUrl } from '@/lib/utils';
export default function Screenshots({images,name}:{images:{url:string;alt?:string}[];name:string}) {
  return <section className="detail-section" aria-labelledby="screenshots-title"><h2 id="screenshots-title">لقطات الشاشة</h2><p className="detail-subtitle">اسحب لاستكشاف الصور</p><div className="screenshot-carousel" tabIndex={0} role="region" aria-label={`لقطات شاشة ${name}`}>
    {images.map((image,index)=><figure key={`${image.url}-${index}`}><img src={safeExternalUrl(image.url)!} alt={image.alt||`لقطة شاشة ${index+1} من ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"/></figure>)}
  </div></section>;
}
