'use client';
import { useId, useState } from 'react';
export default function ExpandableDescription({text}:{text:string}) {
  const [expanded,setExpanded]=useState(false),id=useId(),long=text.length>450;
  return <><p id={id} className={`detail-description${long&&!expanded?' is-collapsed':''}`} dir="auto">{text}</p>{long&&<button type="button" className="description-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(!expanded)}>{expanded?'عرض أقل':'قراءة المزيد'}</button>}</>;
}
