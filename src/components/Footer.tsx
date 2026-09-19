import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/60 bg-slate-950/55">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="surface flex flex-col gap-5 rounded-2xl px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-600 text-sm font-black text-white">
              W
            </span>
            <div>
              <p className="font-bold text-white">{SITE_NAME}</p>
              <p className="mt-0.5 text-xs text-slate-500">مكتبتك السريعة للتطبيقات والألعاب</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-slate-400">
            <Link href="/" className="transition hover:text-cyan-300">
              الرئيسية
            </Link>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-cyan-300"
            >
              تيليجرام
            </a>
            <span className="text-slate-600">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
