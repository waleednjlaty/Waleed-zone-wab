import Link from 'next/link';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';

export default function Navbar() {
  return <header className="sticky top-0 z-50 border-b border-[#dce3df] bg-[#f6f5f0]/95 backdrop-blur-xl">
    <nav className="shell flex h-[70px] items-center justify-between gap-4" aria-label="التنقل الرئيسي">
      <Link href="/" className="flex items-center gap-3" aria-label="وليد زون، الرئيسية">
        <span className="h-11 w-11 shrink-0 rounded-xl bg-[#102c42] bg-[url(/waleed-zone-brand.jpg)] bg-[length:255%_auto] bg-center" aria-hidden="true" />
        <span className="leading-tight"><strong className="block text-[15px] tracking-wide">WALEED ZONE</strong><small className="text-[11px] text-[#667577]">مكتبة التطبيقات والألعاب</small></span>
      </Link>
      <div className="flex items-center gap-1 text-sm font-bold sm:gap-3">
        <Link href="/" className="rounded-lg px-2 py-2 hover:bg-white sm:px-3">الرئيسية</Link>
        <Link href="/#explore" className="hidden rounded-lg px-3 py-2 hover:bg-white sm:inline">استكشف</Link>
        <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="hidden rounded-lg px-3 py-2 hover:bg-white sm:inline">القناة</a>
        <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#173b3b] px-3.5 py-2.5 text-white hover:bg-[#285452]">اطلب من البوت ↗</a>
      </div>
    </nav>
  </header>;
}
