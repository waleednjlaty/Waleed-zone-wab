'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CoverImage from '@/components/CoverImage';
import Icon from '@/components/Icon';
import { appName, type SearchSuggestion } from '@/components/catalog/presentation';

interface SearchBarProps {
  suggestions?: SearchSuggestion[];
  live?: boolean;
  autoFocus?: boolean;
  onNavigate?: () => void;
}

export default function SearchBar({ suggestions = [], live = true, autoFocus = false, onNavigate }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.get('q') || '';
  const category = params.get('category') || '';
  const [value, setValue] = useState(query);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => { setValue(query); }, [query]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  function searchHref(next: string) {
    const search = new URLSearchParams();
    const cleaned = next.trim().slice(0, 100);
    if (cleaned) search.set('q', cleaned);
    if (pathname === '/' && category) search.set('category', category);
    if (pathname === '/' && params.get('browse') === 'all') search.set('browse', 'all');
    return `/${search.size ? `?${search}` : ''}`;
  }

  function navigate(next: string, replace = false) {
    const href = searchHref(next);
    startTransition(() => replace ? router.replace(href, { scroll: false }) : router.push(href));
  }

  function change(next: string) {
    setValue(next);
    setExpanded(true);
    if (timer.current) clearTimeout(timer.current);
    if (live) timer.current = setTimeout(() => navigate(next, true), 450);
  }

  const matches = value.trim() ? suggestions.filter(app => `${app.name || ''} ${app.category || ''}`.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())).slice(0, 5) : [];
  const showSuggestions = expanded && matches.length > 0;

  return <div ref={root} className="search-root" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape') setExpanded(false);
    if (event.key === 'ArrowDown' && event.target === input.current && showSuggestions) {
      event.preventDefault();
      root.current?.querySelector<HTMLAnchorElement>('.search-suggestions a')?.focus();
    }
  }}>
    <form role="search" action="/" className="search-form" aria-busy={pending} onSubmit={event => {
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      setExpanded(false);
      navigate(value);
      onNavigate?.();
    }}>
      <Icon name="search" className="search-symbol" width={22} height={22} />
      <label htmlFor={id} className="sr-only">ابحث عن تطبيق أو لعبة</label>
      <input ref={input} id={id} name="q" type="search" value={value} onChange={event => change(event.target.value)} onFocus={() => setExpanded(true)} maxLength={100} autoComplete="off" autoFocus={autoFocus} placeholder="ابحث عن تطبيق أو لعبة…" aria-controls={showSuggestions ? `${id}-suggestions` : undefined} />
      {value && <button type="button" className="icon-button search-clear" aria-label="مسح البحث" onClick={() => {
        if (timer.current) clearTimeout(timer.current);
        setValue('');
        setExpanded(false);
        // Reset the server catalog and query together, including cached search pages.
        if (live) window.location.replace(searchHref(''));
        input.current?.focus();
      }}><Icon name="close" width={17} height={17} /></button>}
      <button type="submit" className="search-submit">بحث</button>
    </form>
    {showSuggestions && <div id={`${id}-suggestions`} className="search-suggestions">
      <p>اقتراحات من آخر الإضافات</p>
      <ul>{matches.map(app => <li key={app.id}><Link href={`/app/${app.id}`} onClick={() => {
        if (timer.current) clearTimeout(timer.current);
        setExpanded(false);
        onNavigate?.();
      }}><span className="suggestion-icon"><CoverImage src={app.imageUrl} alt="" aspectClassName="aspect-square" /></span><span><strong dir="auto">{appName(app)}</strong><small>{app.category || 'المكتبة'}</small></span><Icon name="chevron" /></Link></li>)}</ul>
    </div>}
    <span className="sr-only" role="status">{pending ? 'جارٍ تحديث نتائج البحث' : ''}</span>
  </div>;
}
