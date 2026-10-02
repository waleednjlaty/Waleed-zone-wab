import Link from 'next/link';
import { TELEGRAM_CHANNEL_URL } from '@/lib/site';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('سياسة الخصوصية', 'كيف يتعامل موقع وليد زون مع بيانات الحساب والجلسة والمفضلة وإحصاءات الزيارة.', '/privacy', { noindex: true });

export default function PrivacyPage() {
  return <article className="shell max-w-4xl py-14 sm:py-20">
    <Link className="view-all mb-6 inline-flex" href="/">وليد زون — الرئيسية ←</Link>
    <p className="eyebrow">YOUR DATA</p><h1 className="mt-3 text-4xl font-black">سياسة الخصوصية</h1>
    <p className="mt-5 leading-8 text-[#a6b5b8]">آخر تحديث: 29 سبتمبر 2026. نوضح هنا البيانات التي يعالجها موقع وليد زون عندما تتصفح أو تنشئ حسابًا.</p>
    <div className="mt-10 space-y-7 leading-8 text-[#a6b5b8]">
      <section><h2 className="text-xl font-black text-white">حسابك</h2><p className="mt-2">عند التسجيل نحفظ اسم العرض والبريد الإلكتروني وكلمة المرور بصيغة تجزئة آمنة، إضافة إلى تاريخ إنشاء الحساب. لا نعرض بريدك للزوار. نحفظ العناصر التي تضيفها إلى المفضلة.</p></section>
      <section><h2 className="text-xl font-black text-white">الجلسة والحماية</h2><p className="mt-2">نضع ملف تعريف ارتباط ضروريًا للدخول، صالحًا لمدة تصل إلى سبعة أيام. نخزن تجزئة رمز الجلسة على الخادم، ونستخدم بيانات الطلب مثل عنوان الشبكة مؤقتًا للحد من محاولات الدخول المسيئة.</p></section>
      <section><h2 className="text-xl font-black text-white">إحصاءات الزيارة</h2><p className="mt-2">نسجل عدد الزيارات باستخدام معرّف مشتق من بيانات الطلب ومفتاح خاص يتغير يوميًا، من دون تخزين عنوان الشبكة الخام في سجل الزيارات. قد تحتفظ البنية المستضيفة بسجلات تشغيل منفصلة.</p></section>
      <section><h2 className="text-xl font-black text-white">الروابط والإعلانات</h2><p className="mt-2">قد تفتح روابط التحميل وتيليجرام مواقع خارجية لها سياساتها الخاصة. إعلانات Google غير مفعلة حاليًا؛ في حال تفعيلها بعد مراجعة المحتوى، قد تستخدم Google ملفات تعريف ارتباط وتقنيات قياس حسب إعداداتها وسياساتها، وسنحدّث هذه الصفحة قبل التفعيل.</p></section>
      <section><h2 className="text-xl font-black text-white">التحكم ببياناتك</h2><p className="mt-2">يمكنك إزالة العناصر المحفوظة وتسجيل الخروج من حسابك. للاستفسار عن بيانات حسابك أو طلب حذفها، تواصل معنا عبر <a className="font-bold text-[#d9f578] hover:underline" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">القناة الرسمية</a>. لا تشارك كلمة مرورك في الرسائل.</p></section>
    </div>
  </article>;
}
