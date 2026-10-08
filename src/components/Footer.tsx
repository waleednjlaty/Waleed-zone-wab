/* eslint-disable @next/next/no-html-link-for-pages -- Catalog directories intentionally use document navigation. */
import Link from 'next/link';
import Brand from '@/components/Brand';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';
import { getLocale } from '@/lib/locale-server';

export default async function Footer() {
  const locale = await getLocale(), english = locale === 'en';
  return <footer className="site-footer"><div className="shell footer-inner">
    <div className="footer-brand"><Link href="/" aria-label={english ? 'Waleed Zone, home' : 'Waleed Zone، الرئيسية'}><Brand /></Link><p>{english ? 'Apps, games and release details in one place.' : 'تطبيقات وألعاب، وتفاصيل الإصدارات في مكان واحد.'}</p></div>
    <nav className="footer-links" aria-label={english ? 'Site links' : 'روابط الموقع'}>
      <Link href="/">{english ? 'Waleed Zone — Home' : 'وليد زون — الرئيسية'}</Link><a href="/apps">{english ? 'Apps' : 'التطبيقات'}</a><a href="/games">{english ? 'Games' : 'الألعاب'}</a><Link href="/about">{english ? 'About' : 'عن الموقع'}</Link><Link href="/privacy">{english ? 'Privacy' : 'الخصوصية'}</Link>
      <Link href="/terms">{english ? 'Terms' : 'الشروط'}</Link><Link href="/copyright">{english ? 'Copyright' : 'حقوق النشر'}</Link><Link href="/contact">{english ? 'Contact' : 'التواصل'}</Link><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">{english ? 'Bot' : 'البوت'}</a><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">Telegram</a>
    </nav>
  </div><div className="shell footer-bottom"><span dir="ltr">© {new Date().getFullYear()} Waleed Zone</span><span>{english ? 'Follow updates through our Telegram community.' : 'تابع التحديثات عبر مجتمعنا على تيليجرام.'}</span></div></footer>;
}
