import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/75 backdrop-blur-xl">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
        aria-label="التنقل الرئيسي"
      >
        <Link href="/" className="group flex min-w-0 items-center gap-3 rounded-2xl">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-violet-600 text-lg font-black text-white shadow-lg shadow-cyan-500/15 ring-1 ring-white/10 transition duration-300 group-hover:scale-105">
            W
            <span
              aria-hidden="true"
              className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-black tracking-tight text-white sm:text-lg">
              {SITE_NAME}
            </span>
            <span className="hidden text-[11px] font-medium text-slate-500 sm:block">
              تطبيقات • ألعاب • أدوات
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2 text-sm font-semibold">
          <Link
            href="/"
            className="hidden rounded-xl px-3.5 py-2 text-slate-300 transition hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            الرئيسية
          </Link>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-2 text-cyan-100 shadow-sm transition hover:border-cyan-300/45 hover:bg-cyan-400/15"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
              <path d="M21.7 3.3a1.8 1.8 0 00-1.85-.25L3.2 9.45a1.55 1.55 0 00.08 2.92l3.86 1.34 1.48 4.72a1.55 1.55 0 002.68.53l2.2-2.5 4.2 3.1a1.8 1.8 0 002.82-1.08L22.3 4.9a1.8 1.8 0 00-.6-1.6zm-12.02 11l-.54 2.7-.82-2.63 8.67-6.85-7.31 6.78z" />
            </svg>
            <span>تيليجرام</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
