'use client';
import { useEffect, useRef, useState } from 'react';
import CoverImage from '@/components/CoverImage';
import FavoriteButton from '@/components/FavoriteButton';
import type { DownloadFile } from '@/components/download/types';
import { useLocale } from '@/components/LocaleProvider';
interface Props {allowSticky?:boolean;name:string;appId:number;imageUrl:string|null;size:string|null;href:string;external:boolean;initialSaved:boolean;signedIn:boolean;directFile?:DownloadFile|null;directConfigured?:boolean;deliveryAvailable?:boolean;}
export default function DownloadActions({allowSticky=true,name,appId,imageUrl,size,href,external,initialSaved,signedIn,directFile,directConfigured,deliveryAvailable}:Props) {
  const locale=useLocale(),english=locale==='en';
  const anchor=useRef<HTMLAnchorElement>(null),[sticky,setSticky]=useState(false);
  useEffect(()=>{
    if(!anchor.current)return;
    const observer=new IntersectionObserver(([entry])=>setSticky(!entry.isIntersecting&&entry.boundingClientRect.bottom<0));
    observer.observe(anchor.current);return ()=>observer.disconnect();
  },[]);
  const direct=Boolean(directFile)||Boolean(directConfigured)||Boolean(deliveryAvailable),destination=direct?`/download/${appId}`:href;
  const label=english?(deliveryAvailable?'Download from Waleed Zone':direct?(directFile?'Direct download':'Direct download status'):external?'Open download link':'Download via bot'):(deliveryAvailable?'تحميل من Waleed Zone':direct?(directFile?'تحميل مباشر':'حالة التحميل المباشر'):external?'فتح رابط التحميل':'تحميل عبر البوت');
  const linkProps=direct?{}:{target:'_blank',rel:`noopener noreferrer${external?' nofollow':''}`};
  return <>
    <div className="detail-actions"><a ref={anchor} className="primary-action detail-download" href={destination} {...linkProps}>{label}<span aria-hidden="true">{direct?'↓':'↗'}</span></a><FavoriteButton appId={appId} initialSaved={initialSaved} signedIn={signedIn}/></div>
    <p className="detail-download-note">{english ? (deliveryAvailable?'Prepare the link on Waleed Zone, then continue the download.':direct?(directFile?'Prepare the link, then download the file directly in your browser.':'Direct download is currently unavailable; open the page to review its status.'):external?'The download is available through the current external link.':'The file is currently available through the Waleed Zone bot.') : (deliveryAvailable?'جهّز الرابط على Waleed Zone، ثم تابع التحميل.':direct?(directFile?'جهّز الرابط، ثم حمّل الملف مباشرة من متصفحك.':'التحميل المباشر غير متاح حاليًا؛ افتح الصفحة لمراجعة الحالة.'):external?'التحميل متاح عبر الرابط الخارجي الحالي.':'الملف متاح عبر بوت Waleed Zone حاليًا.')}</p>
    {allowSticky&&sticky&&<div className="mobile-download-bar"><span className="sticky-app-icon"><CoverImage src={imageUrl} alt="" aspectClassName="aspect-square"/></span><span className="sticky-app-copy"><strong dir="auto">{name}</strong>{size&&<small dir="auto">{size}</small>}</span><a className="primary-action" href={destination} {...linkProps} aria-label={`${label} — ${name}`}>{english ? 'Download' : 'تحميل'} {direct?'↓':'↗'}</a></div>}
  </>;
}
