import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/85 backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
        aria-label="التنقل الرئيسي"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 text-lg font-black text-white shadow-lg shadow-cyan-500/20">
            W
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white">{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
          >
            الرئيسية
          </Link>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
          >
            قناة التيليجرام
          </a>
        </div>
      </nav>
    </header>
  );
}
