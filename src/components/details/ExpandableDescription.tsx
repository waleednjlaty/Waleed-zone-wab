'use client';
import { useId, useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
export default function ExpandableDescription({text}:{text:string}) {
  const locale=useLocale(),english=locale==='en';
  const [expanded,setExpanded]=useState(false),id=useId(),long=text.length>450;
  return <><p id={id} className={`detail-description${long&&!expanded?' is-collapsed':''}`} dir="auto">{text}</p>{long&&<button type="button" className="description-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{english ? (expanded?'Show less':'Read more') : (expanded?'عرض أقل':'قراءة المزيد')}</button>}</>;
}
