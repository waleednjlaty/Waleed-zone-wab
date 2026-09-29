import Image from 'next/image';
import Link from 'next/link';
import { TELEGRAM_BOT_URL,TELEGRAM_CHANNEL_URL } from '@/lib/site';
export default function Footer() { return <footer className="mt-auto border-t border-white/10 bg-[#101b23]"><div className="shell grid gap-10 py-12 md:grid-cols-[1fr_1fr]">
  <div><div className="flex items-center gap-3"><Image src="/wz-mark.svg" width={42} height={42} alt=""/><span className="brand-type text-xl">WALEED<span className="text-[#d9f578]">.</span>ZONE</span></div><p className="mt-4 max-w-sm text-sm leading-7 text-[#a6b5b8]">تطبيقات وألعاب وأدوات في مساحة عربية سهلة التصفح. شاهد المعلومات واحفظ ما يعجبك في مكتبتك.</p></div>
  <div className="grid grid-cols-2 gap-6 text-sm"><div className="grid content-start gap-3"><strong>الموقع</strong><Link href="/">الرئيسية</Link><Link href="/about">من نحن</Link><Link href="/privacy">الخصوصية</Link></div><div className="grid content-start gap-3"><strong>تواصل</strong><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">القناة الرسمية</a><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">بوت الطلبات</a><Link href="/account">مكتبتي</Link></div></div>
  </div><div className="border-t border-white/10 py-4 text-center text-xs text-[#86999f]">© {new Date().getFullYear()} WALEED ZONE · صنع للاكتشاف</div></footer>; }
