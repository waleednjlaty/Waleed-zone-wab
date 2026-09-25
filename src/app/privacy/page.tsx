import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية',
  description: 'سياسة الخصوصية الخاصة بموقع WALEED ZONE وكيفية التعامل مع بيانات الاستخدام التقنية.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="kicker text-[10px] font-black uppercase">PRIVACY</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
        سياسة الخصوصية
      </h1>
      <p className="mt-3 text-sm text-slate-600">آخر تحديث: سبتمبر 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-8 text-slate-400 sm:text-[15px]">
        <section>
          <h2 className="text-lg font-black text-white">بيانات الاستخدام</h2>
          <p className="mt-2">
            يستخدم {SITE_NAME} عداد زيارات أساسيًا. عند الزيارة، تُحوّل بعض البيانات التقنية
            مثل عنوان الشبكة ومعلومات المتصفح إلى قيمة تجزئة (hash) قبل تخزين مفتاح الزائر في
            قاعدة البيانات، بدل تخزين عنوان الشبكة الخام ضمن سجل الزيارات.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-white">الحسابات والبيانات الشخصية</h2>
          <p className="mt-2">
            الموقع لا يتطلب إنشاء حساب لتصفح المكتبة. لا تطلب صفحات المكتبة اسمك أو رقم هاتفك
            أو كلمة مرورك لاستخدام البحث والتصفح.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-white">الروابط الخارجية</h2>
          <p className="mt-2">
            بعض أزرار التحميل تنقلك إلى تيليجرام أو إلى مزود تحميل خارجي. بعد مغادرة الموقع،
            تخضع زيارتك لسياسة وتهيئة الخدمة الخارجية التي فتحتها.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-white">الأمان</h2>
          <p className="mt-2">
            نستخدم قيودًا على مصادر المحتوى، وسياسات لمنع تضمين الموقع داخل إطارات غير موثوقة،
            وHTTPS في بيئة الإنتاج، مع تقليل البيانات التي تكشفها استجابات الخادم قدر الإمكان.
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-white/[0.06] pt-6">
        <Link href="/" className="text-sm font-bold text-cyan-300 transition hover:text-cyan-200">
          ← العودة إلى المكتبة
        </Link>
      </div>
    </div>
  );
}
