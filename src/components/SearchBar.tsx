'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function updateSearch(nextValue: string) {
    const trimmed = nextValue.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.delete('page');
    const query = params.toString();
    router.replace(query ? pathname + '?' + query : pathname);
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => updateSearch(nextValue), 300);
  }

  return (
    <div role="search" className="panel-strong relative flex items-center rounded-2xl p-1.5">
      <span className="pointer-events-none absolute right-5 flex h-9 w-9 items-center justify-center rounded-xl text-cyan-300">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
      </span>

      <input
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="ابحث عن تطبيق، لعبة أو أداة..."
        aria-label="البحث في التطبيقات"
        autoComplete="off"
        spellCheck={false}
        className="h-[3.25rem] w-full rounded-xl border border-transparent bg-black/20 py-3.5 pl-12 pr-14 text-[15px] font-semibold text-white outline-none transition placeholder:font-medium placeholder:text-slate-600 focus:border-cyan-300/20 focus:bg-black/30 sm:h-14 sm:text-base"
      />

      {value ? (
        <button
          type="button"
          onClick={() => handleChange('')}
          aria-label="مسح البحث"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <span className="absolute left-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] font-bold text-slate-600 sm:block">
          SEARCH
        </span>
      )}
    </div>
  );
}
