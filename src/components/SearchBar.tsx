'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CoverImage from '@/components/CoverImage';
import Icon from '@/components/Icon';
import SearchResultsSkeleton from '@/components/loading/SearchResultsSkeleton';

interface Suggestion {id:number;name:string;category:string|null;developer:string|null;imageUrl:string|null;href:string;}
interface SearchBarProps {live?:boolean;autoFocus?:boolean;onNavigate?:()=>void;}
export default function SearchBar({live=true,autoFocus=false,onNavigate}:SearchBarProps) {
  const router=useRouter(),pathname=usePathname(),params=useSearchParams();
  const query=params.get('q')||'',category=params.get('category')||'';
  const [value,setValue]=useState(query),[expanded,setExpanded]=useState(false);
  const [matches,setMatches]=useState<Suggestion[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
  const [pending,startTransition]=useTransition();
  const input=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null),generation=useRef(0),id=useId();
  useEffect(()=>{setValue(query);},[query]);
  useEffect(()=>{if(autoFocus)input.current?.focus();},[autoFocus]);
  useEffect(()=>{
    const current=++generation.current,controller=new AbortController();
    const cleaned=value.trim();setMatches([]);setFailed(false);
    if(!cleaned){setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(async()=>{
      try {
        const response=await fetch(`/api/search?q=${encodeURIComponent(cleaned)}`,{signal:controller.signal});
        if(!response.ok)throw new Error('Search unavailable');
        const data=await response.json();
        if(generation.current===current)setMatches(data.items);
      } catch(error) {
        if(!controller.signal.aborted && generation.current===current)setFailed(true);
      } finally {if(generation.current===current)setLoading(false);}
    },220);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[value]);
  useEffect(()=>{
    function dismiss(event:PointerEvent){if(!root.current?.contains(event.target as Node))setExpanded(false);}
    document.addEventListener('pointerdown',dismiss);
    return ()=>document.removeEventListener('pointerdown',dismiss);
  },[]);
  function searchHref(next:string) {
    const search=new URLSearchParams(),cleaned=next.trim().slice(0,100);
    if(cleaned)search.set('q',cleaned);
    if(pathname==='/'&&category)search.set('category',category);
    if(pathname==='/'&&params.get('browse')==='all')search.set('browse','all');
    return `/${search.size?`?${search}`:''}`;
  }
  const showSuggestions=expanded&&Boolean(value.trim());
  return <div ref={root} className="search-root" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setExpanded(false);}} onKeyDown={event=>{
    if(event.key==='Escape'){setExpanded(false);input.current?.focus();}
    if((event.key==='ArrowDown'||event.key==='ArrowUp')&&showSuggestions){
      const links=Array.from(root.current?.querySelectorAll<HTMLAnchorElement>('.search-suggestions a')||[]);
      if(links.length){event.preventDefault();const index=links.indexOf(event.target as HTMLAnchorElement);const next=index+(event.key==='ArrowDown'?1:-1);(next<0?input.current:links[next%links.length])?.focus();}
    }
  }}>
    <form role="search" action="/" className="search-form" aria-busy={pending} onSubmit={event=>{
      event.preventDefault();setExpanded(false);startTransition(()=>router.push(searchHref(value)));onNavigate?.();
    }}>
      <Icon name="search" className="search-symbol" width={22} height={22}/>
      <label htmlFor={id} className="sr-only">ابحث عن تطبيق أو لعبة</label>
      <input ref={input} id={id} name="q" type="search" value={value} onChange={event=>{setValue(event.target.value);setExpanded(true);}} onFocus={()=>setExpanded(true)} maxLength={100} autoComplete="off" autoFocus={autoFocus} placeholder="ابحث عن تطبيق أو لعبة…" aria-describedby={showSuggestions?`${id}-suggestions`:undefined} aria-controls={showSuggestions?`${id}-suggestions`:undefined}/>
      {value&&<button type="button" className="icon-button search-clear" aria-label="مسح البحث" onClick={()=>{
        setValue('');setExpanded(false);if(live && query)window.location.replace(searchHref(''));input.current?.focus();
      }}><Icon name="close" width={17} height={17}/></button>}
      <button type="submit" className="search-submit">بحث</button>
    </form>
    {showSuggestions&&<div id={`${id}-suggestions`} className="search-suggestions" aria-busy={loading}>
      <p role={loading?undefined:'status'} aria-hidden={loading||undefined}>{loading?'جارٍ البحث…':failed?'البحث غير متاح مؤقتًا':matches.length?'نتائج مقترحة':'ما لقينا نتيجة مطابقة'}</p>
      {loading?<SearchResultsSkeleton count={3} suggestions />:matches.length>0?<ul>{matches.map(app=><li key={app.id}><Link href={app.href} onClick={()=>{setExpanded(false);onNavigate?.();}}><span className="suggestion-icon"><CoverImage src={app.imageUrl} alt="" aspectClassName="aspect-square"/></span><span><strong dir="auto">{app.name}</strong><small dir="auto">{[app.category,app.developer].filter(Boolean).join(' · ')||'المكتبة'}</small></span><Icon name="chevron"/></Link></li>)}</ul>:<div className="search-zero"><span>{failed?'حاول مرة أخرى بعد قليل.':'جرّب اسمًا أقصر، أو بالعربية أو الإنجليزية.'}</span><Link href="/#categories" onClick={()=>{setExpanded(false);onNavigate?.();}}>تصفح التصنيفات</Link></div>}
    </div>}
    <span className="sr-only" role="status">{pending?'جارٍ تحديث نتائج البحث':''}</span>
  </div>;
}
