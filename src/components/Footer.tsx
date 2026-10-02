/* eslint-disable @next/next/no-html-link-for-pages -- Catalog directories intentionally use document navigation. */
import Link from 'next/link';
import Brand from '@/components/Brand';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';

export default function Footer() {
  return <footer className="site-footer"><div className="shell footer-inner">
    <div className="footer-brand"><Link href="/" aria-label="Waleed Zone، الرئيسية"><Brand /></Link><p>تطبيقات وألعاب، وتفاصيل الإصدارات في مكان واحد.</p></div>
    <nav className="footer-links" aria-label="روابط الموقع">
      <Link href="/">وليد زون — الرئيسية</Link><a href="/apps">التطبيقات</a><a href="/games">الألعاب</a><Link href="/about">عن الموقع</Link><Link href="/privacy">الخصوصية</Link>
      <span title="صفحة الشروط لم تُنشر بعد">الشروط — قريبًا</span><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">تواصل وطلبات</a><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">Telegram</a>
    </nav>
  </div><div className="shell footer-bottom"><span dir="ltr">© {new Date().getFullYear()} Waleed Zone</span><span>تابع التحديثات عبر مجتمعنا على تيليجرام.</span></div></footer>;
}
