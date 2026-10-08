
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import AuthForm from '@/components/AuthForm';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return {title:t("إنشاء حساب"),description:t("أنشئ حسابًا في وليد زون واحفظ تطبيقاتك وألعابك المفضلة."),robots:{index:false,follow:false}}; }
export default async function Register() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);
 return <section className="shell grid min-h-[70vh] items-center gap-12 py-14 lg:grid-cols-2"><div className="hidden lg:block"><p className="eyebrow">JOIN THE ZONE</p><h1 className="mt-5 text-6xl font-black leading-[1.18]">{t("اكتشف أكثر.")}<br/><span className="text-[#d9f578]">{t("واحتفظ بالأفضل.")}</span></h1><p className="mt-6 max-w-md text-lg leading-8 text-[#a6b5b8]">{t("أنشئ حسابك المجاني وابدأ بتجميع التطبيقات والألعاب اللي تعجبك.")}</p></div><div className="surface mx-auto w-full max-w-md p-7 sm:p-10"><p className="eyebrow">{t("خطوتك الأولى")}</p><h1 className="mt-3 text-3xl font-black">{t("انضم لوليد زون")}</h1><p className="mt-2 text-sm text-[#a6b5b8]">{t("أنشئ حسابك خلال دقيقة.")}</p><AuthForm mode="register"/></div></section>; }
