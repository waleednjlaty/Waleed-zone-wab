'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
export default function SearchBar() {
 const router=useRouter(),pathname=usePathname(),params=useSearchParams(),[value,setValue]=useState(params.get('q')||'');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setValue(params.get('q')||'');},[params]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 function change(next:string){setValue(next);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{const p=new URLSearchParams(params.toString()),q=next.trim().slice(0,100);if(q)p.set('q',q);else p.delete('q');p.delete('page');router.replace(`${pathname}${p.size?`?${p}`:''}`);},350);}
 return <div role="search" className="flex items-center gap-3 rounded-2xl border border-[#526967] bg-[#17252d] p-2 shadow-2xl"><span aria-hidden="true" className="pr-3 text-2xl text-[#d9f578]">⌕</span><input type="search" value={value} onChange={e=>change(e.target.value)} maxLength={100} aria-label="البحث في المكتبة" placeholder="دوّر على لعبتك أو تطبيقك..." className="min-w-0 flex-1 bg-transparent py-3 text-base font-bold text-white outline-none placeholder:text-[#9aaeb0]"/>{value&&<button type="button" onClick={()=>change('')} aria-label="مسح البحث" className="px-2 text-[#a6b5b8]">✕</button>}<span className="hidden rounded-xl bg-[#d9f578] px-5 py-3 text-sm font-black text-[#142029] sm:block">ابحث</span></div>;
}
