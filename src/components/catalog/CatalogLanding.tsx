import JsonLd from '@/components/JsonLd';
import Link from 'next/link';
import Icon from '@/components/Icon';
import Pagination from '@/components/Pagination';
import { appName } from './presentation';
import { appHref } from '@/lib/catalog/routes';
import { getLanding, landingName, landingPath, type CatalogKind } from '@/lib/catalog/landing';
import { breadcrumbStructuredData } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { getLocale } from '@/lib/locale-server';

export default async function CatalogLanding({ kind, page }: { kind: CatalogKind; page: number }) {
  const locale = await getLocale(), english = locale === 'en';
  const result = await getLanding(kind, page), name = landingName(kind, locale), path = landingPath(kind, page);
  const breadcrumbs = [{ name: english ? 'Home' : 'الرئيسية', item: SITE_URL }, { name, item: SITE_URL + path }];
  const structured = [breadcrumbStructuredData(breadcrumbs), {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name, url: SITE_URL + path,
    mainEntity: { '@type': 'ItemList', numberOfItems: result.items.length, itemListElement: result.items.map((app, index) => ({
      '@type': 'ListItem', position: index + 1, name: appName(app, locale), url: SITE_URL + appHref(app),
    })) },
  }];
  return <div className="shell py-9 sm:py-14">
    <JsonLd data={structured} />
    <nav className="detail-breadcrumbs" aria-label={english ? 'Breadcrumb' : 'مسار التنقل'}><ol><li><Link href="/">{english ? 'Home' : 'الرئيسية'}</Link></li><li><span aria-current="page">{name}</span></li></ol></nav>
    <header className="mb-10">
      <p className="eyebrow" lang="en" dir="ltr">Waleed Zone</p><h1 className="mt-3 text-3xl font-black sm:text-5xl">{name}</h1>
      <p className="intro-description mt-4 leading-8">{english ? (kind === 'games' ? 'Explore published games and check version and platform details before downloading.' : 'Explore published apps and tools and check version and platform details before downloading.') : (kind === 'games' ? 'استكشف الألعاب المنشورة في المكتبة، واقرأ تفاصيل كل لعبة والإصدار والمنصة قبل التحميل.' : 'استكشف التطبيقات والأدوات المنشورة في المكتبة، واقرأ تفاصيل كل تطبيق والإصدار والمنصة قبل التحميل.')}</p>
      <p className="mt-4 text-sm text-[#a6b5b8]">{result.total} {english ? 'items' : 'عنصر'}{page > 1 ? (english ? ` · Page ${page}` : ` · صفحة ${page}`) : ''}</p>
      <a className="view-all mt-4 inline-flex" href={kind === 'games' ? '/apps' : '/games'}>{english ? (kind === 'games' ? 'Browse apps →' : 'Browse games →') : (kind === 'games' ? 'تصفح التطبيقات ←' : 'تصفح الألعاب ←')}</a>
    </header>
    {result.items.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.items.map(app => <li key={app.id}>
      <Link className="surface flex h-full items-center gap-4 p-6 hover:border-[#d9f578]" href={appHref(app)}>
        <Icon name={kind === 'games' ? 'game' : 'apps'} width={24} height={24} />
        <span className="min-w-0"><span className="block break-words font-bold" dir="auto">{appName(app, locale)}</span>{app.category && <span className="mt-2 block text-sm text-[#a6b5b8]">{app.category}</span>}</span>
      </Link>
    </li>)}</ul> : <p className="surface p-8 text-[#a6b5b8]">{english ? `No ${kind === 'games' ? 'games' : 'apps'} have been published in the library yet.` : <>لم تُنشر {kind === 'games' ? 'ألعاب' : 'تطبيقات'} في المكتبة بعد.</>}</p>}
    <div className="mt-10"><Pagination currentPage={page} totalPages={result.totalPages} basePath={`/${kind}`} /></div>
  </div>;
}
