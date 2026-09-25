import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CoverImage from '@/components/CoverImage';
import { getAppById, getRelatedApps } from '@/lib/queries';
import { SITE_NAME, SITE_URL, telegramDownloadUrl } from '@/lib/site';
import { categoryPath, formatDate, safeHttpUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AppPageProps {
  params: { id: string };
}

function parseId(value: string): number | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getSchemaCategory(category?: string | null, name?: string | null): string {
  const value = (category + ' ' + name).toLowerCase();

  if (/game|gaming|ألعاب|لعبة/.test(value)) return 'GameApplication';
  if (/social|chat|messag|تواصل|مراسلة/.test(value)) return 'SocialNetworkingApplication';
  if (/photo|video|music|media|صور|فيديو|موسيقى|وسائط/.test(value)) return 'MultimediaApplication';
  if (/security|vpn|حماية|أمان/.test(value)) return 'SecurityApplication';
  if (/browser|متصفح/.test(value)) return 'BrowserApplication';
  if (/education|learn|تعليم|دراسة/.test(value)) return 'EducationalApplication';
  if (/finance|bank|مال|بنك/.test(value)) return 'FinanceApplication';
  if (/tool|util|أداة|أدوات/.test(value)) return 'UtilitiesApplication';

  return 'UtilitiesApplication';
}

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const id = parseId(params.id);
  const app = id ? await getAppById(id) : undefined;

  if (!app) return { title: 'التطبيق غير موجود', robots: { index: false, follow: false } };

  const name = app.name ?? 'تطبيق رقم ' + app.id;
  const description = (app.description ?? 'تحميل ' + name + ' من WALEED ZONE.').slice(0, 160);
  const title = name + (app.version ? ' ' + app.version : '') + ' — تحميل';
  const imageUrl = safeHttpUrl(app.imageUrl);

  return {
    title,
    description,
    alternates: { canonical: '/app/' + app.id },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE_NAME,
      title,
      description,
      url: SITE_URL + '/app/' + app.id,
      ...(imageUrl ? { images: [{ url: imageUrl, alt: name }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function AppPage({ params }: AppPageProps) {
  const id = parseId(params.id);
  if (id === null) notFound();

  const app = await getAppById(id);
  if (!app) notFound();

  const related = await getRelatedApps(app.id, app.category, 4);
  const appName = app.name ?? 'تطبيق رقم ' + app.id;
  const imageUrl = safeHttpUrl(app.imageUrl);
  const directDownloadUrl = safeHttpUrl(app.downloadUrl);
  const isGame =
    /(^|[\s/-])(game|games|gaming|ألعاب|لعبة)/i.test(app.category ?? '') ||
    /(game|gaming)/i.test(app.name ?? '');
  const isMobile = /(android|ios|iphone|mobile|أندرويد|ايفون)/i.test(app.platform ?? '');
  const schemaType = isGame
    ? ['VideoGame', isMobile ? 'MobileApplication' : 'SoftwareApplication']
    : isMobile
      ? 'MobileApplication'
      : 'SoftwareApplication';

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: SITE_NAME,
      item: SITE_URL,
    },
    ...(app.category
      ? [{
          '@type': 'ListItem',
          position: 2,
          name: app.category,
          item: SITE_URL + categoryPath(app.category),
        }]
      : []),
    {
      '@type': 'ListItem',
      position: app.category ? 3 : 2,
      name: appName,
      item: SITE_URL + '/app/' + app.id,
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': schemaType,
        name: appName,
        description: app.description,
        ...(imageUrl ? { image: imageUrl } : {}),
        url: SITE_URL + '/app/' + app.id,
        applicationCategory: getSchemaCategory(app.category, app.name),
        operatingSystem: app.platform,
        softwareVersion: app.version,
        datePublished: app.createdAt,
        publisher: {
          '@type': 'Organization',
          name: app.developer || SITE_NAME,
        },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
        ...(isGame ? { gamePlatform: app.platform ?? 'PC' } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="مسار التنقل" className="mb-6 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 sm:text-sm">
        <Link href="/" className="transition hover:text-cyan-300">المكتبة</Link>
        <span aria-hidden="true">/</span>
        {app.category ? (
          <>
            <Link href={categoryPath(app.category)} className="transition hover:text-cyan-300">
              {app.category}
            </Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span className="max-w-[16rem] truncate text-slate-400">{appName}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <article className="overflow-hidden rounded-2xl border border-white/[0.065] bg-[#0d1218]">
          <div className="relative border-b border-white/[0.05] bg-[#090d12] p-3 sm:p-5">
            <CoverImage
              src={imageUrl}
              alt={appName}
              aspectClassName="aspect-[16/10] rounded-xl"
              imgClassName="rounded-xl"
            />
          </div>

          <div className="p-5 sm:p-7">
            <p className="kicker text-[10px] font-black uppercase">APP DETAILS</p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              {appName}
            </h1>

            <div className="mt-4 flex flex-wrap gap-2">
              {app.category ? <MetaChip>{app.category}</MetaChip> : null}
              {app.platform ? <MetaChip>{app.platform}</MetaChip> : null}
              {app.version ? <MetaChip>{app.version}</MetaChip> : null}
              {app.size ? <MetaChip>{app.size}</MetaChip> : null}
            </div>

            <div className="mt-7 border-t border-white/[0.06] pt-7">
              <h2 className="text-sm font-black text-white">عن التطبيق</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-400 sm:text-[15px]">
                {app.description || 'لا يوجد وصف إضافي لهذا التطبيق حاليًا.'}
              </p>
            </div>

            <div className="mt-8 border-t border-white/[0.06] pt-7">
              <h2 className="text-sm font-black text-white">المعلومات التقنية</h2>
              <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Spec label="الإصدار" value={app.version} />
                <Spec label="الحجم" value={app.size} />
                <Spec label="الفئة" value={app.category} />
                <Spec label="المنصة" value={app.platform} />
                <Spec label="المطور" value={app.developer} />
                <Spec label="تاريخ الإضافة" value={formatDate(app.createdAt)} />
              </dl>
            </div>
          </div>
        </article>

        <aside className="panel-strong rounded-2xl p-5 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-500">جاهز للتحميل</p>
              <h2 className="mt-1 text-xl font-black text-white">تحميل {appName}</h2>
            </div>
            <span className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
              مجاني
            </span>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            استخدم بوت تيليجرام للحصول على الملف، أو الرابط المباشر إذا كان متوفرًا.
          </p>

          <div className="mt-5 grid gap-2.5">
            <a
              href={telegramDownloadUrl(app.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="accent-button inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-black transition hover:-translate-y-0.5"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M21.7 3.3a1.8 1.8 0 00-1.85-.25L3.2 9.45a1.55 1.55 0 00.08 2.92l3.86 1.34 1.48 4.72a1.55 1.55 0 002.68.53l2.2-2.5 4.2 3.1a1.8 1.8 0 002.82-1.08L22.3 4.9a1.8 1.8 0 00-.6-1.6zm-12.02 11l-.54 2.7-.82-2.63 8.67-6.85-7.31 6.78z" />
              </svg>
              تحميل عبر تيليجرام
            </a>

            {directDownloadUrl ? (
              <a
                href={directDownloadUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="subtle-button inline-flex items-center justify-center rounded-xl px-5 py-3.5 text-sm font-black"
              >
                رابط تحميل مباشر
              </a>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-4 text-[11px] leading-5 text-slate-600">
            تأكد من اسم التطبيق والإصدار قبل التحميل، خصوصًا إذا كنت تستبدل نسخة موجودة عندك.
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-14 border-t border-white/[0.06] pt-8" aria-labelledby="related-heading">
          <div className="mb-6">
            <p className="text-xs font-bold text-slate-600">قد يعجبك أيضًا</p>
            <h2 id="related-heading" className="mt-1 text-2xl font-black text-white">محتوى مشابه</h2>
          </div>
          <AppGrid apps={related} />
        </section>
      ) : null}
    </div>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-xs font-bold text-slate-400">
      {children}
    </span>
  );
}

function Spec({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/[0.15] px-4 py-3">
      <dt className="text-[10px] font-bold text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-slate-200">{value || '—'}</dd>
    </div>
  );
}
