'use client';
import { useEffect, useRef, useState } from 'react';
import CoverImage from '@/components/CoverImage';
import FavoriteButton from '@/components/FavoriteButton';
interface Props {name:string;appId:number;imageUrl:string|null;size:string|null;href:string;external:boolean;initialSaved:boolean;signedIn:boolean;}
export default function DownloadActions({name,appId,imageUrl,size,href,external,initialSaved,signedIn}:Props) {
  const anchor=useRef<HTMLAnchorElement>(null),[sticky,setSticky]=useState(false);
  useEffect(()=>{
    if(!anchor.current)return;
    const observer=new IntersectionObserver(([entry])=>setSticky(!entry.isIntersecting&&entry.boundingClientRect.bottom<0));
    observer.observe(anchor.current);return ()=>observer.disconnect();
  },[]);
  const label=external?'فتح رابط التحميل':'تحميل عبر البوت';
  return <>
    <div className="detail-actions"><a ref={anchor} className="primary-action detail-download" href={href} target="_blank" rel={`noopener noreferrer${external?' nofollow':''}`}>{label}<span aria-hidden="true">↗</span></a><FavoriteButton appId={appId} initialSaved={initialSaved} signedIn={signedIn}/></div>
    <p className="detail-download-note">{external?'التحميل متاح عبر الرابط الخارجي الحالي.':'الملف متاح عبر بوت Waleed Zone حاليًا.'}</p>
    {sticky&&<div className="mobile-download-bar"><span className="sticky-app-icon"><CoverImage src={imageUrl} alt="" aspectClassName="aspect-square"/></span><span className="sticky-app-copy"><strong dir="auto">{name}</strong>{size&&<small dir="auto">{size}</small>}</span><a className="primary-action" href={href} target="_blank" rel={`noopener noreferrer${external?' nofollow':''}`} aria-label={`${label} — ${name}`}>تحميل ↗</a></div>}
  </>;
}
