import Link from 'next/link';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';

export default function Footer() {
  return <footer className="mt-auto bg-[#17302f] text-[#d1dfda]">
    <div className="shell grid gap-8 py-12 sm:grid-cols-2 sm:items-end">
      <div><p className="text-2xl font-black text-white">WALEED ZONE<span className="text-[#e36b42]">.</span></p><p className="mt-3 max-w-md text-sm leading-7">مكان مرتب لاكتشاف التطبيقات والألعاب. اقرأ التفاصيل، ثم اختر طريقة التحميل المناسبة.</p></div>
      <div className="flex flex-wrap gap-5 text-sm sm:justify-end"><Link href="/">الرئيسية</Link><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">قناة تيليجرام</a><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">بوت الطلبات</a></div>
    </div><div className="border-t border-white/10 py-4 text-center text-xs text-[#9db1ab]">© {new Date().getFullYear()} WALEED ZONE</div>
  </footer>;
}
