
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import TrustPage from '@/components/legal/TrustPage';
import ContactMethods from '@/components/legal/ContactMethods';
import {pageMetadata} from '@/lib/seo';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return pageMetadata(t("حقوق النشر وطلبات الإزالة"),t("كيفية طلب إزالة محتوى أو تصحيحه أو استبدال مصدره أو حذف رابطه من Waleed Zone."),'/copyright',{noindex:true,locale}); }
export default async function CopyrightPage(){
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);
return <TrustPage title={t("حقوق النشر وطلبات الإزالة")}>
  <p>{t("نحترم حقوق أصحاب المحتوى. إذا كنت صاحب الحق أو مفوضًا عنه، يمكنك طلب إزالة مادة من الكتالوج، أو تصحيح معلوماتها، أو استبدال مصدرها، أو حذف رابطها.")}</p>
  <section><h2>{t("ما الذي نحتاجه لفهم الطلب؟")}</h2><ol><li>{t("تحديد العمل أو البرنامج أو الصورة التي يخصّها الحق، مع مصدر مرجعي إن توفر.")}</li><li>{t("رابط صفحة Waleed Zone المعنية، وتحديد الجزء أو الرابط محل الطلب.")}</li><li>{t("ما يثبت ملكيتك أو صلاحيتك للتصرف نيابةً عن صاحب الحق؛ أرسل القدر الضروري فقط.")}</li><li>{t("وسيلة تواصل للرد عليك.")}</li><li>{t("وصف المشكلة وسبب اعتقادك بوجود انتهاك، والإجراء الذي تطلبه.")}</li></ol></section>
  <section><h2>{t("إرسال الطلب ومراجعته")}</h2><p>{t("أرسل عنوانًا واضحًا مثل «طلب حقوق نشر — اسم التطبيق»، ثم المعلومات أعلاه إلى البريد العام إذا ظهر أدناه. عند عدم وجود بريد معلن، استخدم وسائل Telegram العامة لمعرفة طريقة التواصل المتاحة. احتفظ بنسخة من طلبك وروابطه.")}</p><ContactMethods/><p>{t("نراجع المعلومات وقد نطلب تفاصيل لازمة، ثم نقرر الإجراء المناسب بناءً على ما توفر. قد نزيل المادة أو نقيّدها أثناء المراجعة، أو نصحّحها أو نحذف رابطها. لا نعد بنتيجة أو مهلة ثابتة قبل فهم الطلب؛ حذف رابط من الموقع لا يحذف نسخة محفوظة لدى جهة خارجية.")}</p></section>
  <section><h2>{t("حماية المعلومات")}</h2><p>{t("لا ترسل كلمات مرور أو مفاتيح وصول أو أرقام هوية كاملة أو بيانات دفع. تجنّب نشر أدلة خاصة في تعليقات عامة. تقديم بلاغ لا يغيّر أهلية الإعلانات تلقائيًا؛ مراجعة الحقوق والمحتوى مسؤولية المالك.")}</p></section>
</TrustPage>;}
