import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/[0.05]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-300 text-sm font-black text-slate-950">W</span>
          <div>
            <p className="text-sm font-black tracking-wide text-white">{SITE_NAME}</p>
            <p className="mt-1 text-xs text-slate-600">تطبيقات، ألعاب وأدوات بمكان واحد.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
          <Link href="/" className="transition hover:text-white">المكتبة</Link>
          <Link href="/about" className="transition hover:text-white">عن الموقع</Link>
          <Link href="/privacy" className="transition hover:text-white">الخصوصية</Link>
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-cyan-300">
            تيليجرام
          </a>
          <span className="text-slate-700">© {new Date().getFullYear()} WALEED ZONE</span>
        </div>
      </div>
    </footer>
  );
}
