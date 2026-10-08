
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import Link from 'next/link';
import TrustPage from '@/components/legal/TrustPage';
import ContactMethods from '@/components/legal/ContactMethods';
import {pageMetadata} from '@/lib/seo';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return pageMetadata(t("التواصل"),t("وسائل التواصل العامة لطلبات الحقوق وتصحيح التطبيقات والمشكلات التقنية في Waleed Zone."),'/contact',{noindex:true,locale}); }
export default async function ContactPage(){
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);
return <TrustPage title={t("التواصل")}>
  <section><h2>{t("التواصل العام")}</h2><p>{t("للاستفسارات والملاحظات استخدم البريد العام إذا كان ظاهرًا، أو وسائل Telegram العامة التالية. البوت وسيلة التحميل والمساعدة المتاحة؛ القناة تنشر التحديثات ووسائل التواصل المعلنة.")}</p><ContactMethods/></section>
  <section><h2>{t("حقوق النشر والإزالة")}</h2><p>{t("أرسل رابط الصفحة وتحديد العمل وإثبات صلاحيتك ووسيلة الرد ووصف المشكلة. اقرأ")} <Link href="/copyright">{t("تفاصيل طلب الإزالة أو التصحيح")}</Link>  {t("قبل الإرسال.")}</p></section>
  <section><h2>{t("تصحيح بيانات تطبيق أو لعبة")}</h2><p>{t("اذكر اسم التطبيق ورابطه والمعلومة المطلوب تصحيحها والإصدار المقصود ومصدرًا موثوقًا إن توفر. إذا كانت معلومة غير معروفة، وضّح ذلك بدل تخمينها.")}</p></section>
  <section><h2>{t("المشكلات التقنية")}</h2><p>{t("اذكر رابط الصفحة، ووقت المشكلة، ونوع الجهاز والمتصفح، والخطوات التي سبقتها. يمكن إرفاق لقطة شاشة بعد إخفاء بياناتك الخاصة. لا ترسل كلمة المرور أو رمز الجلسة أو رابطًا موقّعًا أو بيانات دفع.")}</p></section>
</TrustPage>;}
