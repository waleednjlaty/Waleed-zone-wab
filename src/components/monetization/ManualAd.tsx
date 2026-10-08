'use client';
import { useTranslateUI } from '@/components/LocaleProvider';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { adRouteAllowed } from '@/lib/ads';
import { adConsentGranted, type TcfApi, type TcfData } from '@/lib/monetization/consent';

declare global {interface Window {__tcfapi?: TcfApi;adsbygoogle?: unknown[];}}
type Props = {publisherId:string;slotId:string;cmpId:number;nonce?:string;path:string};
/** Mounted ONLY by server-authorized detail pages. No SDK before live CMP consent. */
export default function ManualAd({publisherId,slotId,cmpId,nonce,path}:Props) {
  const t = useTranslateUI();

  const pathname=usePathname(),[consent,setConsent]=useState(false),[loaded,setLoaded]=useState(false);
  const pushed=useRef(false),element=useRef<HTMLModElement>(null);
  let currentPath='';
  try { currentPath=decodeURIComponent(pathname||''); } catch { /* Malformed path cannot serve ads. */ }
  const routeAllowed=currentPath===path&&adRouteAllowed(currentPath);
  useEffect(()=>{
    let active=true,api:TcfApi|undefined,listenerId:number|undefined,registered=false;
    const callback=(data:TcfData,success:boolean)=>{
      listenerId=data?.listenerId;
      if(!active){if(api&&listenerId!==undefined){try{api('removeEventListener',2,()=>{},listenerId);}catch{/* Fail closed. */}}return;}
      setConsent(adConsentGranted(data,success,cmpId));
    };
    // Provider-specific, Google-certified CMP bootstrap must be configured by owner.
    // Missing stub, CMP failure or no answer means no advertising network requests.
    const subscribe=()=>{
      if(registered||!window.__tcfapi)return;
      api=window.__tcfapi;
      try{api('addEventListener',2,callback);registered=true;}catch{setConsent(false);}
    };
    subscribe();const timer=window.setInterval(subscribe,500);
    return()=>{active=false;window.clearInterval(timer);if(api&&listenerId!==undefined){try{api('removeEventListener',2,()=>{},listenerId);}catch{/* No consent fallback. */}}};
  },[cmpId]);
  useEffect(()=>{
    if(!routeAllowed||!consent||!loaded||pushed.current||!element.current)return;
    pushed.current=true;
    try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{/* Do not retry ad requests or report click data. */}
  },[routeAllowed,consent,loaded]);
  if(!routeAllowed||!consent)return null;
  return <section aria-label={t("إعلان")} className="manual-ad-placement">
    <p className="manual-ad-label">{t("إعلان")}</p>
    <Script id="wz-manual-adsense" nonce={nonce} async strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`} crossOrigin="anonymous" onReady={()=>setLoaded(true)}/>
    <ins ref={element} className="adsbygoogle" style={{display:'block',minHeight:250}} data-ad-client={publisherId}
      data-ad-slot={slotId} data-ad-format="rectangle" data-full-width-responsive="true" />
  </section>;
}
