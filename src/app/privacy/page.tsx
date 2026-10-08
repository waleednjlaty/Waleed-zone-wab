
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import Link from 'next/link';
import { TELEGRAM_CHANNEL_URL } from '@/lib/site';
import { adsenseState } from '@/lib/ads';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return pageMetadata(t("سياسة الخصوصية"), t("كيف يتعامل موقع وليد زون مع بيانات الحساب والجلسة والمفضلة وإحصاءات الزيارة."), '/privacy', { noindex: true, locale }); }

export default async function PrivacyPage() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  const ads=adsenseState();
  return <article className="shell max-w-4xl py-14 sm:py-20">
    <Link className="view-all mb-6 inline-flex" href="/">{t("وليد زون — الرئيسية ←")}</Link>
    <p className="eyebrow">YOUR DATA</p><h1 className="mt-3 text-4xl font-black">{t("سياسة الخصوصية")}</h1>
    <p className="mt-5 leading-8 text-[#a6b5b8]">{t("آخر تحديث: 4 أكتوبر 2026. نوضح هنا البيانات التي يعالجها موقع وليد زون عندما تتصفح أو تنشئ حسابًا.")}</p>
    <div className="mt-10 space-y-7 leading-8 text-[#a6b5b8]">
      <section><h2 className="text-xl font-black text-white">{t("حسابك")}</h2><p className="mt-2">{t("عند التسجيل نحفظ اسم العرض والبريد الإلكتروني وكلمة المرور بصيغة تجزئة آمنة، إضافة إلى تاريخ إنشاء الحساب. لا نعرض بريدك للزوار. نحفظ العناصر التي تضيفها إلى المفضلة.")}</p></section>
      <section><h2 className="text-xl font-black text-white">{t("الجلسة والحماية")}</h2><p className="mt-2">{t("نضع ملف تعريف ارتباط ضروريًا للدخول، صالحًا لمدة تصل إلى سبعة أيام. نخزن تجزئة رمز الجلسة على الخادم، ونستخدم بيانات الطلب مثل عنوان الشبكة مؤقتًا للحد من محاولات الدخول المسيئة.")}</p></section>
      <section><h2 className="text-xl font-black text-white">{t("إحصاءات الزيارة")}</h2><p className="mt-2">{t("نسجل عدد الزيارات باستخدام معرّف مشتق من بيانات الطلب ومفتاح خاص يتغير يوميًا، من دون تخزين عنوان الشبكة الخام في سجل الزيارات. هذا المعرّف اليومي مجزّأ وليس ضمانًا لإخفاء الهوية الكامل. نحفظ أيضًا عدادات يومية مجمّعة لمشاهدات التفاصيل وصفحة التحميل والتجهيز والاسترداد والتحويل إلى Telegram. جدول العدادات لا يخزن عنوان الشبكة الخام أو وكيل المستخدم الكامل أو وجهة التحميل أو رقم رسالة الملف، ولا نضع ملف ارتباط خاصًا بهذه العدادات. قد تتكرر الأحداث للشخص نفسه، وقد تُفقد بعض العدادات عند الانقطاع أو الضغط. قد تحتفظ البنية المستضيفة بسجلات تشغيل منفصلة.")}</p></section>
      <section><h2 className="text-xl font-black text-white">{t("الروابط والإعلانات")}</h2><p className="mt-2">{t("قد تفتح روابط التحميل وتيليجرام مواقع خارجية لها سياساتها الخاصة.")} {ads.serving?t("إعداد عرض الإعلانات مفعّل، لكن كل موضع يتطلب مراجعة الصفحة وموافقة الخصوصية."):t("إعلانات Google مغلقة من إعدادات العرض حاليًا.")}  {t("عند إتاحتها قد تستخدم Google وشركاؤها ملفات تعريف ارتباط ومعرّفات وتقنيات قياس لتقديم الإعلانات وتخصيصها. الإعلان المخصّص يعتمد على إشارات الاهتمام والموافقة؛ غير المخصّص لا يعتمد على ملف تخصيص مماثل لكنه قد يستخدم تقنيات عرض وقياس. التنفيذ الحالي لا يقدم إعلانًا بديلًا عند الرفض. لا نحمّل كود الإعلان قبل قرار موافقة صالح من منصة إدارة موافقة (CMP) معدّة لهذا الغرض. رفض الإعلانات لا يمنع تصفح المحتوى أو التحميل. لا نسجّل نقرات AdSense بأنفسنا. تعرف على")} <a className="font-bold hover:underline" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">{t("استخدام Google للبيانات")}</a>{t(". عند إتاحة الإعلانات، ستعرض منصة الموافقة خياراتك للموافقة وتغييرها وسحبها.")}</p></section>
      <section><h2 className="text-xl font-black text-white">{t("التحكم ببياناتك")}</h2><p className="mt-2">{t("يمكنك إزالة العناصر المحفوظة وتسجيل الخروج من حسابك. للاستفسار عن بيانات حسابك أو طلب حذفها، تواصل معنا عبر")} <a className="font-bold text-[#d9f578] hover:underline" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">{t("القناة الرسمية")}</a>{t(". لا تشارك كلمة مرورك في الرسائل.")}</p></section>
    </div>
  </article>;
}
