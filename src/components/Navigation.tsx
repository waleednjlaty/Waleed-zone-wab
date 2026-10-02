'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Brand from '@/components/Brand';
import Icon from '@/components/Icon';
import SearchBar from '@/components/SearchBar';

const links = [
  { href: '/', label: 'الرئيسية' },
  { href: '/apps', label: 'التطبيقات' },
  { href: '/games', label: 'الألعاب' },
  { href: '/#updates', label: 'التحديثات' },
];

export default function Navigation({ signedIn, categories }: { signedIn: boolean; categories: string[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeHash, setActiveHash] = useState('');
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const filtered = Boolean(params.get('q') || params.get('category') || params.get('page') || params.get('browse'));

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setActiveHash(window.location.hash);
  }, [pathname, params]);

  useEffect(() => {
    function hashChanged() { setActiveHash(window.location.hash); }
    window.addEventListener('hashchange', hashChanged);
    return () => window.removeEventListener('hashchange', hashChanged);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    } else dialog.current?.close();
  }, [searchOpen]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
        header.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(item => {
          item.open = false;
          item.querySelector<HTMLElement>('summary')?.focus();
        });
      }
      const target = event.target as HTMLElement;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        setMenuOpen(false);
        setSearchOpen(true);
      }
    }
    function outside(event: PointerEvent) {
      if (!header.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        header.current?.querySelectorAll<HTMLDetailsElement>('details').forEach(item => { item.open = false; });
      }
    }
    document.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside); };
  }, [menuOpen]);

  function closeNavigation() {
    setMenuOpen(false);
    header.current?.querySelectorAll<HTMLDetailsElement>('details').forEach(item => { item.open = false; });
  }

  function navLink(link: typeof links[number]) {
    const hash = link.href.includes('#') ? `#${link.href.split('#')[1]}` : '';
    const active = hash ? pathname === '/' && !filtered && hash === activeHash :
      link.href === '/' ? pathname === '/' && !filtered && !activeHash :
      pathname === link.href || pathname.startsWith(`${link.href}/`);
    if(link.href==='/apps'||link.href==='/games') return <a key={link.href} href={link.href} className={`nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={closeNavigation}>{link.label}</a>;
    return <Link key={link.href} href={link.href} className={`nav-link${active ? ' is-active' : ''}`} aria-current={active ? (hash ? 'location' : 'page') : undefined} onClick={() => { setActiveHash(hash); closeNavigation(); }}>{link.label}</Link>;
  }

  const categoryMenu = <details className="category-menu"><summary className="nav-link">التصنيفات <Icon name="down" width={15} height={15} /></summary><div className="category-dropdown">
    <Link href="/#categories" onClick={closeNavigation}>كل التصنيفات</Link>
    {categories.map(category => <Link key={category} href={`/category/${encodeURIComponent(category)}`} onClick={closeNavigation}>{category}</Link>)}
  </div></details>;

  return <header ref={header} className="site-header">
    <nav className="shell header-inner" aria-label="التنقل الرئيسي">
      <Link href="/" className="brand-link" aria-label="Waleed Zone، الرئيسية" onClick={closeNavigation}><Brand /></Link>
      <div className="desktop-nav">{links.slice(0, 3).map(navLink)}{categoryMenu}{navLink(links[3])}</div>
      <div className="header-actions">
        <button ref={searchButton} type="button" className="icon-button header-search" aria-label="فتح البحث" aria-haspopup="dialog" onClick={() => { setMenuOpen(false); setSearchOpen(true); }}><Icon name="search" /><span>بحث</span><kbd>/</kbd></button>
        <Link className="icon-button account-link" href={signedIn ? '/account' : '/login'} aria-label={signedIn ? 'حسابي ومكتبتي' : 'تسجيل الدخول'}><Icon name="account" /></Link>
        <button ref={menuButton} type="button" className="icon-button mobile-menu-button" aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
      </div>
    </nav>
    <div id="mobile-navigation" className="mobile-navigation shell" hidden={!menuOpen}>
      <nav aria-label="قائمة الهاتف">{links.slice(0, 3).map(navLink)}{categoryMenu}{navLink(links[3])}<Link className="nav-link" href={signedIn ? '/account' : '/login'} onClick={closeNavigation}>{signedIn ? 'حسابي ومكتبتي' : 'تسجيل الدخول'}</Link>{!signedIn && <Link className="nav-link" href="/register" onClick={closeNavigation}>إنشاء حساب</Link>}</nav>
    </div>
    <dialog ref={dialog} className="search-dialog" aria-labelledby="search-dialog-title" onCancel={() => setSearchOpen(false)} onClose={() => { setSearchOpen(false); searchButton.current?.focus(); }} onClick={event => {
      if (event.target === dialog.current) {
        const bounds = dialog.current.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setSearchOpen(false);
      }
    }}>
      <div className="search-dialog-heading"><h2 id="search-dialog-title">ابحث في Waleed Zone</h2><button className="icon-button" type="button" aria-label="إغلاق البحث" onClick={() => setSearchOpen(false)}><Icon name="close" /></button></div>
      {searchOpen && <SearchBar live={false} autoFocus onNavigate={() => setSearchOpen(false)} />}
      <p className="search-help">ابحث بالعربية أو الإنجليزية، ثم افتح التفاصيل.</p>
    </dialog>
  </header>;
}
