import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, TELEGRAM_BOT_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'عن WALEED ZONE',
  description:
    'تعرف على WALEED ZONE، مكتبة عربية لتصفح التطبيقات والألعاب والأدوات والوصول إلى معلوماتها وروابط تحميلها.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="kicker text-[10px] font-black uppercase">ABOUT</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
        عن {SITE_NAME}
      </h1>

      <div className="mt-8 space-y-5 text-sm leading-8 text-slate-400 sm:text-[15px]">
        <p>
          WALEED ZONE مكتبة عربية تساعدك على اكتشاف التطبيقات والألعاب والأدوات والوصول إلى معلومات
          أساسية عنها مثل الإصدار والحجم والمنصة قبل الانتقال إلى رابط التحميل.
        </p>
        <p>
          الموقع مرتبط بمنظومة WALEED ZONE على تيليجرام، ويعرض المحتوى المنشور من قاعدة البيانات
          بواجهة سريعة ومتجاوبة مع الهاتف والكمبيوتر.
        </p>
        <p>
          هدفنا إبقاء صفحات التطبيقات واضحة ومباشرة: اسم دقيق، وصف مفهوم، معلومات تقنية، وروابط
          تحميل بدون إخفاء وجهة الرابط عن المستخدم.
        </p>
      </div>

      <div className="panel mt-10 rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg font-black text-white">التواصل</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          للاستفسار عن محتوى منشور أو رابط تحميل، استخدم بوت WALEED ZONE على تيليجرام.
        </p>
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="accent-button mt-5 inline-flex rounded-xl px-5 py-2.5 text-sm font-black"
        >
          فتح تيليجرام
        </a>
      </div>

      <div className="mt-8">
        <Link href="/" className="text-sm font-bold text-cyan-300 transition hover:text-cyan-200">
          ← العودة إلى المكتبة
        </Link>
      </div>
    </div>
  );
}
