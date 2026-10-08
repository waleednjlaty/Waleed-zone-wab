
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import Link from 'next/link';

export default async function NotFound() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-black tracking-tighter text-[#d9f578]">404</p>
      <h1 className="mt-4 text-2xl font-black text-white">{t("الصفحة مو موجودة")}</h1>
      <p className="mt-2 text-sm leading-6 text-[#a6b5b8]">{t("ممكن الرابط قديم، أو التطبيق انحذف من المكتبة.")}</p>
      <Link href="/" className="primary-action mt-6 rounded-xl px-5 py-2.5 text-sm font-black">{t("العودة للمكتبة")}</Link>
    </div>
  );
}
