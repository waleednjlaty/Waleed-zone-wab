import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800/60 bg-slate-950/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-8 text-center text-sm text-slate-400 sm:px-6 md:flex-row md:justify-between md:text-right">
        <p>
          © {new Date().getFullYear()}{' '}
          <span className="font-semibold text-slate-200">{SITE_NAME}</span>. جميع الحقوق محفوظة.
        </p>
        <div className="flex items-center gap-4">
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-cyan-300"
          >
            تواصل عبر تيليجرام
          </a>
          <Link href="/" className="transition hover:text-cyan-300">
            الرئيسية
          </Link>
        </div>
      </div>
    </footer>
  );
}
