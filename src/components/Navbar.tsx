import Image from 'next/image';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { TELEGRAM_BOT_URL } from '@/lib/site';
export default async function Navbar() {
  const user=await getCurrentUser();
  return <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1218]/95 backdrop-blur-xl"><nav className="shell flex h-[72px] items-center justify-between gap-4" aria-label="التنقل الرئيسي">
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="وليد زون، الرئيسية"><Image src="/wz-mark.svg" width={43} height={43} alt="" className="rounded-xl"/><span className="min-w-0"><strong className="brand-type block truncate text-lg leading-none">WALEED<span className="text-[#d9f578]">.</span>ZONE</strong><small className="mt-1 block text-[11px] font-bold text-[#9eafb5]">عالمك الرقمي يبدأ من هنا</small></span></Link>
    <div className="flex items-center gap-2 text-sm font-bold sm:gap-4"><Link href="/#library" className="hidden hover:text-[#d9f578] sm:inline">المكتبة</Link><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="hidden hover:text-[#d9f578] md:inline">بوت الطلبات ↗</a>
      {user?<Link href="/account" className="secondary-action !px-3 !py-2.5">حسابي</Link>:<Link href="/login" className="secondary-action !px-3 !py-2.5">دخول</Link>}
      {!user&&<Link href="/register" className="primary-action !px-3 !py-2.5">انضم مجانًا</Link>}
    </div>
  </nav></header>;
}
