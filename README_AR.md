# موقع Waleed Zone

[English](README.md)

واجهة ويب عربية لعرض التطبيقات والألعاب المنشورة ضمن منصة Waleed Zone. يكمل الموقع عمل بوت تيليجرام عبر قراءة المحتوى المنشور من PostgreSQL وعرضه ضمن كتالوج سريع، قابل للبحث، ومتوافق مع محركات البحث.

## المزايا

- واجهة عربية باتجاه من اليمين إلى اليسار
- البحث عن التطبيقات والألعاب بالاسم
- التصفية حسب الفئات وتقسيم النتائج إلى صفحات
- صفحة تفاصيل مستقلة لكل عنصر
- أزرار للتنزيل المباشر أو الانتقال إلى بوت تيليجرام
- تصميم داكن ومتجاوب مع الهاتف والكمبيوتر
- بيانات وصفية ديناميكية وOpen Graph وJSON-LD
- إنشاء sitemap.xml وrobots.txt تلقائيًا
- صفحات تحميل وخطأ وعدم وجود ونتائج فارغة
- اتصال قراءة فقط بقاعدة البيانات
- ترويسات أمان واستعلامات محمية بالمعاملات
- جاهز للنشر على Vercel مع Neon

## التقنيات

- Next.js 14 باستخدام App Router
- React 18
- TypeScript
- Tailwind CSS
- Drizzle ORM
- PostgreSQL / Neon
- postgres.js

## المتطلبات

- Node.js 18.17 أو أحدث
- npm
- قاعدة PostgreSQL تحتوي جدول `applications`

## التشغيل السريع

### 1. تنزيل المشروع

```bash
git clone https://github.com/waleednjlaty/ChannelSite.git
cd ChannelSite
```

### 2. تثبيت الحزم

```bash
npm install
```

### 3. إعداد متغيرات البيئة

على Linux وmacOS:

```bash
cp .env.example .env.local
```

على Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

عدّل القيم المطلوبة:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

استخدم مستخدم PostgreSQL بصلاحية قراءة فقط في الإنتاج، ولا ترفع `.env.local` إلى GitHub أو تضع رابط قاعدة البيانات داخل كود يعمل في المتصفح.

### 4. تشغيل بيئة التطوير

```bash
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000).

## أوامر المشروع

| الأمر | وظيفته |
|---|---|
| `npm run dev` | تشغيل خادم التطوير |
| `npm run build` | إنشاء نسخة الإنتاج |
| `npm run start` | تشغيل نسخة الإنتاج |
| `npm run lint` | فحص ESLint |
| `npm run typecheck` | فحص TypeScript دون إنشاء ملفات |

قبل النشر شغّل:

```bash
npm run lint
npm run typecheck
npm run build
```

## قاعدة البيانات

يتوقع الموقع وجود جدول `applications` تديره خدمة موثوقة مثل بوت Waleed Zone. الموقع نفسه ينفذ عمليات قراءة فقط.

| الحقل | وظيفته |
|---|---|
| `id` | معرّف التطبيق |
| `name` | الاسم الظاهر |
| `description` | الوصف الكامل |
| `version` | الإصدار |
| `size` | حجم التنزيل |
| `category` | الفئة |
| `platform` | المنصة |
| `developer` | المطور أو الناشر |
| `download_url` | رابط التنزيل |
| `image_url` | صورة الغلاف |
| `created_at` | تاريخ الإضافة |

يجب إبقاء البنية متوافقة مع [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

## بنية المشروع

```text
.
├── src/
│   ├── app/
│   │   ├── app/[id]/       # صفحة تفاصيل التطبيق
│   │   ├── layout.tsx      # التخطيط العربي والبيانات العامة
│   │   ├── page.tsx        # الصفحة الرئيسية والبحث
│   │   ├── sitemap.ts      # خريطة الموقع الديناميكية
│   │   └── robots.ts       # تعليمات محركات البحث
│   ├── components/         # مكونات الواجهة والكتالوج
│   └── lib/
│       ├── db.ts           # اتصال PostgreSQL وDrizzle
│       ├── db/schema.ts    # تعريف جدول applications
│       ├── queries.ts      # استعلامات القراءة
│       ├── site.ts         # إعدادات الموقع والبوت
│       └── utils.ts        # أدوات البحث وتقسيم الصفحات
├── .env.example
├── next.config.js
├── package.json
└── tailwind.config.ts
```

## تخصيص الموقع

اسم الموقع ووصفه ورابط البوت موجودة في [`src/lib/site.ts`](src/lib/site.ts):

```ts
export const SITE_NAME = 'WALEED ZONE';
export const TELEGRAM_BOT_URL = 'https://t.me/WALEED_ZONE_BOT';
```

ضع النطاق الحقيقي في `NEXT_PUBLIC_SITE_URL` حتى تستخدم الروابط الأساسية وOpen Graph وrobots.txt وsitemap.xml عنوان الإنتاج الصحيح.

## النشر على Vercel

1. استورد الريبو من GitHub إلى Vercel.
2. اترك إطار العمل المحدد على Next.js.
3. أضف `DATABASE_URL` و`NEXT_PUBLIC_SITE_URL`.
4. ابدأ النشر.
5. اختبر الصفحة الرئيسية وصفحة تفاصيل و`/robots.txt` و`/sitemap.xml`.

عند استخدام Neon على منصة serverless، استخدم رابط الاتصال المجمّع pooled connection string.

## الأمان

- أنشئ مستخدم قاعدة بيانات بصلاحية `SELECT` فقط.
- احتفظ ببيانات الاتصال ضمن متغيرات الخادم.
- غيّر بيانات الدخول فورًا إذا ظهرت في commit أو سجل أو صورة أو محادثة.
- راجع Content Security Policy قبل إضافة سكربتات أو خدمات خارجية.
- شغّل `npm run build` قبل كل عملية نشر.

## المشروع المرتبط

- [بوت Waleed Zone على تيليجرام](https://github.com/waleednjlaty/MyTelegramBot)

## المساهمة

المشكلات وطلبات الدمج مرحب بها. للتغييرات الكبيرة، افتح Issue واشرح السلوك المطلوب أولًا.

---

طُوّر ويُصان بواسطة [وليد النجلات](https://github.com/waleednjlaty).
