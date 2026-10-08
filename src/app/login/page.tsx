
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import AuthForm from '@/components/AuthForm';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return {title:t("تسجيل الدخول"),description:t("ادخل إلى حسابك في وليد زون للوصول إلى مكتبتك المحفوظة."),robots:{index:false,follow:false}}; }
export default async function Login() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);
 return <section className="shell grid min-h-[70vh] items-center gap-12 py-14 lg:grid-cols-2"><div className="hidden lg:block"><p className="eyebrow">YOUR SPACE</p><h1 className="mt-5 text-6xl font-black leading-[1.18]">{t("مكتبتك،")}<br/><span className="text-[#d9f578]">{t("على مزاجك.")}</span></h1><p className="mt-6 max-w-md text-lg leading-8 text-[#a6b5b8]">{t("احفظ الألعاب والتطبيقات التي أعجبتك، وارجع لها وقت ما بدك.")}</p><div className="mt-10 h-1 w-28 rounded-full bg-[#d9f578]"/></div><div className="surface mx-auto w-full max-w-md p-7 sm:p-10"><p className="eyebrow">{t("أهلًا برجعتك")}</p><h1 className="mt-3 text-3xl font-black">{t("سجّل دخولك")}</h1><p className="mt-2 text-sm text-[#a6b5b8]">{t("حساب واحد، ومفضّلتك كلها بمكان واحد.")}</p><AuthForm mode="login"/></div></section>; }
