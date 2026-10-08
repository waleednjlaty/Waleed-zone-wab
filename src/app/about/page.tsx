
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import Link from 'next/link';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return pageMetadata(t("عن وليد زون"), t("تعرّف على وليد زون وطريقة استكشاف التطبيقات والألعاب والتواصل عبر قناة وبوت تيليجرام الرسميين."), '/about', {locale}); }

export default async function AboutPage() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  return <div className="shell max-w-4xl py-14 sm:py-20">
    <p className="eyebrow">ABOUT THE ZONE</p>
    <h1 className="mt-3 text-4xl font-black sm:text-5xl">{t("عن وليد زون — Waleed Zone")}</h1>
    <p className="mt-6 max-w-2xl text-lg leading-9 text-[#a6b5b8]">{t("وليد زون مكتبة عربية تعرض معلومات التطبيقات والألعاب والأدوات، وتساعدك في الوصول إلى المحتوى المنشور عبر البوت. يمكنك حفظ ما يعجبك في مكتبتك والعودة إليه بسهولة.")}</p>
    <div className="mt-12 grid gap-5 sm:grid-cols-2">
      <div className="surface p-7"><span className="text-3xl text-[#d9f578]">◈</span><h2 className="mt-5 text-xl font-black">{t("تصفّح واضح")}</h2><p className="mt-3 leading-8 text-[#a6b5b8]">{t("ابحث بالاسم، استكشف الفئات، واقرأ تفاصيل الإصدار والمصدر قبل أي تحميل.")}</p></div>
      <div className="surface p-7"><span className="text-3xl text-[#efb696]">♡</span><h2 className="mt-5 text-xl font-black">{t("مكتبتك أنت")}</h2><p className="mt-3 leading-8 text-[#a6b5b8]">{t("أنشئ حسابًا لتحفظ عناصرك المفضلة وتجدها من أي جهاز.")}</p></div>
    </div>
    <div className="mt-10 flex flex-wrap gap-3"><Link className="primary-action" href="/">{t("استكشف المكتبة ←")}</Link><a className="secondary-action" href={TELEGRAM_CHANNEL_URL} rel="noopener noreferrer" target="_blank">{t("القناة الرسمية ↗")}</a><a className="secondary-action" href={TELEGRAM_BOT_URL} rel="noopener noreferrer" target="_blank">{t("البوت ↗")}</a></div>
  </div>;
}
