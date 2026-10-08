
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import {schedulePageMetric} from '@/lib/analytics/schedule';
import { headers } from 'next/headers';
import { manualAdConfig } from '@/lib/ads';
import { applicationAdEligible } from '@/lib/monetization/eligibility';
import ManualAd from '@/components/monetization/ManualAd';
import JsonLd from '@/components/JsonLd';
import Link from 'next/link';
import AppGrid from '@/components/AppGrid';
import CoverImage from '@/components/CoverImage';
import SectionHeading from '@/components/SectionHeading';
import ExpandableDescription from './ExpandableDescription';
import DownloadActions from './DownloadActions';
import { getDownloadAvailability, getFallbackDelivery } from '@/components/download/presentation';
import Screenshots from './Screenshots';
import Versions from './Versions';
import { appName, isGame } from '@/components/catalog/presentation';
import { getRelatedApps } from '@/lib/queries';
import { authDb, ensureAuthTables, getCurrentUser } from '@/lib/auth';
import { getCatalogDetails } from '@/lib/catalog/metadata';
import { appHref } from '@/lib/catalog/routes';
import { resolveDetail } from '@/lib/catalog/resolve';
import { SITE_URL, telegramDownloadUrl } from '@/lib/site';
import { breadcrumbStructuredData } from '@/lib/seo';
import { formatDate, safeExternalUrl } from '@/lib/utils';

const available=(value:string|null|undefined)=>value?.trim()&&!/^[-–—.]+$/.test(value.trim())?value.trim():null;
export default async function DetailPage({slug,kind}:{slug:string;kind:'apps'|'games'}) {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  const app=await resolveDetail(slug,kind),details=getCatalogDetails(app.id),name=appName(app,locale);
  const [related,user,downloadAvailability,fallbackDelivery]=await Promise.all([getRelatedApps(app.id,app.category,4),getCurrentUser(),getDownloadAvailability(app.id),getFallbackDelivery(app.id)]);
  const adConfig=manualAdConfig();
  const adEligible=Boolean(adConfig && app.description && app.description.trim().length >= 200 && await applicationAdEligible(app.id));
  const nonce=adEligible ? (await headers()).get('x-nonce') || undefined : undefined;
  let saved=false;
  if(user){await ensureAuthTables();const sql=authDb();const [row]=await sql`SELECT 1 FROM site_favorites WHERE user_id=${user.id} AND application_id=${app.id} LIMIT 1`;saved=Boolean(row);}
  const direct=safeExternalUrl(app.downloadUrl),download=direct||telegramDownloadUrl(app.id),url=SITE_URL+appHref(app);
  const categoryPath=app.category?`/category/${encodeURIComponent(app.category)}`:null;
  const technical=[[t("الإصدار"),app.version],[t("حجم الملف"),app.size],[t("متطلبات Android"),details.android],[t("المعمارية"),details.architecture],[t("اسم الحزمة"),details.packageName],[t("نوع الملف"),details.fileType],[t("المنصة"),app.platform],[t("آخر تحديث"),formatDate(details.updatedAt, locale)],[t("تاريخ الإضافة"),formatDate(app.createdAt, locale)],[t("المطور"),app.developer],[t("التصنيف"),app.category]].filter((row):row is [string,string]=>Boolean(available(row[1])));
  const breadcrumbs=[{name:t("الرئيسية"),item:SITE_URL},{name:kind==='games'?t("الألعاب"):t("التطبيقات"),item:`${SITE_URL}/${kind}`},...(app.category?[{name:app.category,item:SITE_URL+categoryPath}]:[]),{name,item:url}];
  const structured=[{'@context':'https://schema.org','@type':'SoftwareApplication',name,url,
    ...(app.description?{description:app.description}:{}),...(safeExternalUrl(app.imageUrl)?{image:safeExternalUrl(app.imageUrl)}:{}),
    applicationCategory:isGame(app)?'GameApplication':app.category||undefined,operatingSystem:app.platform||undefined,
    softwareVersion:available(app.version)||undefined,fileSize:available(app.size)||undefined,
    ...(details.updatedAt&&formatDate(details.updatedAt, locale)?{dateModified:details.updatedAt}:{}),
  },breadcrumbStructuredData(breadcrumbs)];
  await schedulePageMetric('detail_view',app.id,appHref(app));
  return <div className="shell detail-page">
    <JsonLd data={structured} />
    <nav className="detail-breadcrumbs" aria-label={t("مسار التنقل")}><ol>{breadcrumbs.map((crumb,index)=><li key={index}>{index===breadcrumbs.length-1?<span aria-current="page" dir="auto">{name}</span>:(crumb.item===`${SITE_URL}/apps`||crumb.item===`${SITE_URL}/games`)?<a href={crumb.item.replace(SITE_URL,'')}>{crumb.name}</a>:<Link href={crumb.item.replace(SITE_URL,'')||'/'}>{crumb.name}</Link>}</li>)}</ol></nav>
    <article>
      <header className="detail-summary">
        <div className="detail-identity"><span className="detail-icon"><CoverImage priority src={app.imageUrl} alt={t("أيقونة {0}", name)} aspectClassName="aspect-square"/></span><div className="detail-name"><p className="eyebrow">{kind==='games'?t("لعبة"):t("تطبيق")}{app.category?` · ${app.category}`:''}</p><h1 dir="auto">{name}</h1>{available(app.developer)&&<p className="detail-developer" dir="auto">{app.developer}</p>}</div></div>
        <div className="detail-primary-meta">{available(app.version)&&<span><small>{t("الإصدار")}</small><strong dir="auto">{app.version}</strong></span>}{available(app.size)&&<span><small>{t("حجم الملف")}</small><strong dir="auto">{app.size}</strong></span>}{available(details.android)&&<span><small>Android</small><strong dir="auto">{details.android}</strong></span>}{typeof app.downloads==='number'&&app.downloads>0&&<span><small>{t("التحميلات")}</small><strong>{new Intl.NumberFormat(locale).format(app.downloads)}</strong></span>}</div>
        <div className="detail-download-area"><DownloadActions allowSticky={!adEligible} name={name} appId={app.id} imageUrl={app.imageUrl} size={available(app.size)} href={download} external={Boolean(direct)} initialSaved={saved} signedIn={Boolean(user)} deliveryAvailable={Boolean(fallbackDelivery)} directFile={downloadAvailability.file} directConfigured={downloadAvailability.mode!=='legacy'}/>{direct&&!fallbackDelivery&&downloadAvailability.mode==='legacy'&&<a className="detail-alternate-download" href={telegramDownloadUrl(app.id)} rel="noopener noreferrer">{t("التحميل عبر البوت ↗")}</a>}</div>
      </header>
      <div className="detail-content-grid"><div className="detail-main">
        {Boolean(details.screenshots?.length)&&<Screenshots images={details.screenshots!} name={name}/>}
        <section className="detail-section" aria-labelledby="description-title"><h2 id="description-title">{kind==='games'?t("عن اللعبة"):t("عن التطبيق")}</h2>{app.description?<ExpandableDescription text={app.description}/>:<p className="detail-subtitle">{t("لم يُضف وصف لهذا المحتوى بعد.")}</p>}</section>
        {details.changelog&&<section className="detail-section" aria-labelledby="changelog-title"><h2 id="changelog-title">{t("ما الجديد؟")}</h2><p className="detail-description" dir="auto">{details.changelog}</p></section>}
        {details.modInfo&&<section className="detail-section" aria-labelledby="mod-title"><h2 id="mod-title">{t("معلومات النسخة المعدلة")} <span className="app-badge" lang="en">MOD</span></h2><p className="detail-description" dir="auto">{details.modInfo}</p></section>}
      </div><aside className="detail-technical detail-section" aria-labelledby="technical-title"><h2 id="technical-title">{t("المعلومات التقنية")}</h2><dl>{technical.map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl></aside><div className="detail-version-section"><Versions items={details.versions||[]}/></div></div>
    </article>
    {related.length>0&&<section className="catalog-section detail-related" aria-labelledby="related-title"><SectionHeading id="related-title" title={kind==='games'?t("ألعاب ذات صلة"):t("تطبيقات ذات صلة")} subtitle={t("من التصنيف أو المطوّر نفسه")} href={categoryPath||undefined} linkLabel={t("عرض التصنيف")}/><AppGrid apps={related}/></section>}
    {adEligible && adConfig && <ManualAd key={app.id} {...adConfig} nonce={nonce} path={appHref(app)} />}
  </div>;
}
