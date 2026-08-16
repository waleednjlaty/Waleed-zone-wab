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

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function updateSearch(nextValue: string) {
    const trimmed = nextValue.trim();
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => updateSearch(nextValue), 350);
  }

  return (
    <div role="search" className="relative w-full">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="ابحث عن تطبيق أو لعبة أو أداة..."
        aria-label="البحث في التطبيقات"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/70 py-3.5 pl-11 pr-12 text-base text-white placeholder-slate-500 shadow-lg shadow-black/20 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
      />
      {value ? (
        <button
          type="button"
          onClick={() => handleChange('')}
          aria-label="مسح البحث"
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
