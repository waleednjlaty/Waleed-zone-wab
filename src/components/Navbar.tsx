import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#070a0e]/88 backdrop-blur-xl">
      <nav
        className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
        aria-label="التنقل الرئيسي"
      >
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300 text-base font-black text-slate-950 shadow-[0_10px_30px_-18px_rgba(34,211,238,.95)] transition group-hover:rotate-3 group-hover:scale-105">
            W
          </span>
          <span className="min-w-0 leading-none">
            <span className="block truncate text-[15px] font-black tracking-[0.08em] text-white sm:text-base">
              {SITE_NAME}
            </span>
            <span className="mt-1 hidden text-[10px] font-semibold tracking-wide text-slate-500 sm:block">
              APPS · GAMES · TOOLS
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white sm:inline-flex"
          >
            المكتبة
          </Link>
          <Link
            href="/popular"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white md:inline-flex"
          >
            الأكثر تحميلًا
          </Link>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="subtle-button inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 text-cyan-300">
              <path d="M21.7 3.3a1.8 1.8 0 00-1.85-.25L3.2 9.45a1.55 1.55 0 00.08 2.92l3.86 1.34 1.48 4.72a1.55 1.55 0 002.68.53l2.2-2.5 4.2 3.1a1.8 1.8 0 002.82-1.08L22.3 4.9a1.8 1.8 0 00-.6-1.6zm-12.02 11l-.54 2.7-.82-2.63 8.67-6.85-7.31 6.78z" />
            </svg>
            <span>البوت</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
