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

    const query = params.toString();
    router.replace(query ? pathname + '?' + query : pathname);
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => updateSearch(nextValue), 350);
  }

  return (
    <div role="search" className="surface soft-ring relative w-full rounded-2xl p-1.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-300/80"
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
        placeholder="دور على تطبيق، لعبة أو أداة..."
        aria-label="البحث في التطبيقات"
        autoComplete="off"
        spellCheck={false}
        className="h-12 w-full rounded-xl border border-transparent bg-slate-950/55 py-3 pl-12 pr-12 text-[15px] font-medium text-white placeholder-slate-500 outline-none transition focus:border-cyan-400/35 focus:bg-slate-950/80 focus:ring-2 focus:ring-cyan-400/10 sm:h-14 sm:text-base"
      />

      {value ? (
        <button
          type="button"
          onClick={() => handleChange('')}
          aria-label="مسح البحث"
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
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
