import Link from 'next/link';
import TrustPage from '@/components/legal/TrustPage';
import ContactMethods from '@/components/legal/ContactMethods';
import {pageMetadata} from '@/lib/seo';
export const metadata=pageMetadata('التواصل','وسائل التواصل العامة لطلبات الحقوق وتصحيح التطبيقات والمشكلات التقنية في Waleed Zone.','/contact',{noindex:true});
export default function ContactPage(){return <TrustPage title="التواصل">
  <section><h2>التواصل العام</h2><p>للاستفسارات والملاحظات استخدم البريد العام إذا كان ظاهرًا، أو وسائل Telegram العامة التالية. البوت وسيلة التحميل والمساعدة المتاحة؛ القناة تنشر التحديثات ووسائل التواصل المعلنة.</p><ContactMethods/></section>
  <section><h2>حقوق النشر والإزالة</h2><p>أرسل رابط الصفحة وتحديد العمل وإثبات صلاحيتك ووسيلة الرد ووصف المشكلة. اقرأ <Link href="/copyright">تفاصيل طلب الإزالة أو التصحيح</Link> قبل الإرسال.</p></section>
  <section><h2>تصحيح بيانات تطبيق أو لعبة</h2><p>اذكر اسم التطبيق ورابطه والمعلومة المطلوب تصحيحها والإصدار المقصود ومصدرًا موثوقًا إن توفر. إذا كانت معلومة غير معروفة، وضّح ذلك بدل تخمينها.</p></section>
  <section><h2>المشكلات التقنية</h2><p>اذكر رابط الصفحة، ووقت المشكلة، ونوع الجهاز والمتصفح، والخطوات التي سبقتها. يمكن إرفاق لقطة شاشة بعد إخفاء بياناتك الخاصة. لا ترسل كلمة المرور أو رمز الجلسة أو رابطًا موقّعًا أو بيانات دفع.</p></section>
</TrustPage>;}
