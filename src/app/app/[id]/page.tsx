import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import CoverImage from '@/components/CoverImage';
import { getAppById, getRelatedApps } from '@/lib/queries';
import { SITE_NAME, SITE_URL, telegramDownloadUrl } from '@/lib/site';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AppPageProps {
  params: { id: string };
}

function parseId(value: string): number | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const id = parseId(params.id);
  const app = id ? await getAppById(id) : undefined;

  if (!app) {
    return { title: 'التطبيق غير موجود' };
  }

  const name = app.name ?? `تطبيق رقم ${app.id}`;
  const description = (app.description ?? `تحميل ${name}`).slice(0, 160);
  const title = `${name}${app.version ? ` ${app.version}` : ''} — تحميل`;
  const imageUrl = app.imageUrl;

  return {
    title,
    description,
    alternates: { canonical: `/app/${app.id}` },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}/app/${app.id}`,
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

  const appName = app.name ?? `تطبيق رقم ${app.id}`;
  const isGame =
    /(^|[\s/-])(game|games|gaming|ألعاب|لعبة)/i.test(app.category ?? '') ||
    /(game|gaming)/i.test(app.name ?? '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': isGame ? 'VideoGame' : 'SoftwareApplication',
    name: appName,
    description: app.description,
    image: app.imageUrl,
    url: `${SITE_URL}/app/${app.id}`,
    applicationCategory: app.category,
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
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav
        aria-label="مسار التنقل"
        className="mb-6 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500"
      >
        <Link href="/" className="transition hover:text-cyan-300">
          الرئيسية
        </Link>
        <span aria-hidden="true">‹</span>
        {app.category ? (
          <>
            <Link
              href={`/?category=${encodeURIComponent(app.category)}`}
              className="transition hover:text-cyan-300"
            >
              {app.category}
            </Link>
            <span aria-hidden="true">‹</span>
          </>
        ) : null}
        <span className="font-medium text-slate-200">{appName}</span>
      </nav>

      <article className="surface overflow-hidden rounded-[2rem]">
        <div className="grid gap-8 p-5 sm:p-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10">
          <CoverImage
            src={app.imageUrl}
            alt={appName}
            aspectClassName="aspect-[4/3] rounded-3xl border border-slate-700/70 shadow-2xl shadow-black/30"
          />
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">{appName}</h1>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              {app.version ? (
                <span className="rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 py-1 text-slate-200">
                  {app.version}
                </span>
              ) : null}
              {app.size ? (
                <span className="rounded-lg border border-violet-400/15 bg-violet-500/10 px-3 py-1 text-violet-300">
                  {app.size}
                </span>
              ) : null}
              {app.platform ? (
                <span className="rounded-lg border border-cyan-400/15 bg-cyan-500/10 px-3 py-1 text-cyan-300">
                  {app.platform}
                </span>
              ) : null}
              {app.category ? (
                <span className="rounded-lg border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                  {app.category}
                </span>
              ) : null}
            </div>
            <p className="whitespace-pre-line text-sm leading-7 text-slate-300 sm:text-base">
              {app.description}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800/80 bg-slate-950/45 p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-black text-white">تحميل {appName}</h2><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200">مجاني</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a
              href={telegramDownloadUrl(app.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:from-cyan-400 hover:to-violet-500"
            >
              تحميل عبر تيليجرام 🚀
            </a>
            {app.downloadUrl ? (
              <a
                href={app.downloadUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-6 py-4 text-base font-black text-slate-100 transition hover:-translate-y-0.5 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white"
              >
                رابط تحميل مباشر بديل 🔗
              </a>
            ) : null}
          </div>
        </div>

        <div className="border-t border-slate-800/80 p-5 sm:p-8">
          <h2 className="text-lg font-bold text-white">معلومات التطبيق</h2>
          <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-800/90 sm:grid-cols-2 lg:grid-cols-3">
            <Spec label="الإصدار" value={app.version} />
            <Spec label="الحجم" value={app.size} />
            <Spec label="الفئة" value={app.category} />
            <Spec label="المنصة" value={app.platform} />
            <Spec label="المطور" value={app.developer} />
            <Spec label="تاريخ الإضافة" value={formatDate(app.createdAt)} />
          </dl>
        </div>
      </article>

      {related.length > 0 ? (
        <section className="mt-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-6 text-xl font-black text-white sm:text-2xl">
            تطبيقات مشابهة
          </h2>
          <AppGrid apps={related} />
        </section>
      ) : null}
    </div>
  );
}

function Spec({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1 bg-slate-900/75 px-5 py-4 transition hover:bg-slate-900">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-100">{value || '—'}</dd>
    </div>
  );
}
