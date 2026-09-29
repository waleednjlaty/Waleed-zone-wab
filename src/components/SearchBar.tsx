'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
export default function SearchBar() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [value, setValue] = useState(params.get('q') || '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setValue(params.get('q') || ''); }, [params]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function update(next: string) { setValue(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { const p = new URLSearchParams(params.toString()); const q = next.trim().slice(0,100); if (q) p.set('q',q); else p.delete('q'); p.delete('page'); router.replace(`${pathname}${p.size ? `?${p}` : ''}`); }, 350); }
  return <div role="search" className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-[0_20px_55px_-28px_#0008]">
    <span aria-hidden="true" className="pr-3 text-xl text-[#667577]">⌕</span>
    <input type="search" value={value} onChange={e => update(e.target.value)} maxLength={100} placeholder="ابحث عن لعبة، تطبيق، أو أداة..." aria-label="البحث في المكتبة" className="min-w-0 flex-1 bg-transparent py-3 text-base text-[#142426] outline-none placeholder:text-[#8c9998]" />
    {value && <button type="button" onClick={() => update('')} aria-label="مسح البحث" className="px-2 text-[#667577]">✕</button>}
    <span className="hidden rounded-xl bg-[#e36b42] px-5 py-3 text-sm font-bold text-white sm:block">ابحث</span>
  </div>;
}
