import Link from 'next/link';
import AppGrid from '@/components/AppGrid';
import CoverImage from '@/components/CoverImage';
import SectionHeading from '@/components/SectionHeading';
import ExpandableDescription from './ExpandableDescription';
import DownloadActions from './DownloadActions';
import { getDownloadPresentation } from '@/components/download/presentation';
import Screenshots from './Screenshots';
import Versions from './Versions';
import { appName, isGame } from '@/components/catalog/presentation';
import { getRelatedApps } from '@/lib/queries';
import { authDb, ensureAuthTables, getCurrentUser } from '@/lib/auth';
import { getCatalogDetails } from '@/lib/catalog/metadata';
import { appHref } from '@/lib/catalog/routes';
import { resolveDetail } from '@/lib/catalog/resolve';
import { SITE_URL, telegramDownloadUrl } from '@/lib/site';
import { formatDate, safeExternalUrl, safeJsonLd } from '@/lib/utils';

const available=(value:string|null|undefined)=>value?.trim()&&!/^[-–—.]+$/.test(value.trim())?value.trim():null;
export default async function DetailPage({slug,kind}:{slug:string;kind:'apps'|'games'}) {
  const app=await resolveDetail(slug,kind),details=getCatalogDetails(app.id),name=appName(app);
  const [related,user]=await Promise.all([getRelatedApps(app.id,app.category,4),getCurrentUser()]);
  let saved=false;
  if(user){await ensureAuthTables();const sql=authDb();const [row]=await sql`SELECT 1 FROM site_favorites WHERE user_id=${user.id} AND application_id=${app.id} LIMIT 1`;saved=Boolean(row);}
  const direct=safeExternalUrl(app.downloadUrl),download=direct||telegramDownloadUrl(app.id),url=SITE_URL+appHref(app);
  const categoryPath=app.category?`/category/${encodeURIComponent(app.category)}`:null;
  const technical=[['الإصدار',app.version],['حجم الملف',app.size],['متطلبات Android',details.android],['المعمارية',details.architecture],['اسم الحزمة',details.packageName],['نوع الملف',details.fileType],['المنصة',app.platform],['آخر تحديث',formatDate(details.updatedAt)],['تاريخ الإضافة',formatDate(app.createdAt)],['المطور',app.developer],['التصنيف',app.category]].filter((row):row is [string,string]=>Boolean(available(row[1])));
  const breadcrumbs=[{name:'الرئيسية',item:SITE_URL},{name:kind==='games'?'الألعاب':'التطبيقات',item:`${SITE_URL}/#${kind}`},...(app.category?[{name:app.category,item:SITE_URL+categoryPath}]:[]),{name,item:url}];
  const structured=[{'@context':'https://schema.org','@type':'SoftwareApplication',name,url,
    ...(app.description?{description:app.description}:{}),...(safeExternalUrl(app.imageUrl)?{image:safeExternalUrl(app.imageUrl)}:{}),
    applicationCategory:isGame(app)?'GameApplication':app.category||undefined,operatingSystem:app.platform||undefined,
    softwareVersion:available(app.version)||undefined,fileSize:available(app.size)||undefined,
    ...(app.developer?{author:{'@type':'Organization',name:app.developer}}:{}),
    ...(details.updatedAt&&formatDate(details.updatedAt)?{dateModified:details.updatedAt}:{}),
  },{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:breadcrumbs.map((item,index)=>({'@type':'ListItem',position:index+1,...item}))}];
  return <div className="shell detail-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(structured)}}/>
    <nav className="detail-breadcrumbs" aria-label="مسار التنقل"><ol>{breadcrumbs.map((crumb,index)=><li key={index}>{index===breadcrumbs.length-1?<span aria-current="page" dir="auto">{name}</span>:<Link href={crumb.item.replace(SITE_URL,'')||'/'}>{crumb.name}</Link>}</li>)}</ol></nav>
    <article>
      <header className="detail-summary">
        <div className="detail-identity"><span className="detail-icon"><CoverImage src={app.imageUrl} alt={`أيقونة ${name}`} aspectClassName="aspect-square"/></span><div className="detail-name"><p className="eyebrow">{kind==='games'?'لعبة':'تطبيق'}{app.category?` · ${app.category}`:''}</p><h1 dir="auto">{name}</h1>{available(app.developer)&&<p className="detail-developer" dir="auto">{app.developer}</p>}</div></div>
        <div className="detail-primary-meta">{available(app.version)&&<span><small>الإصدار</small><strong dir="auto">{app.version}</strong></span>}{available(app.size)&&<span><small>حجم الملف</small><strong dir="auto">{app.size}</strong></span>}{available(details.android)&&<span><small>Android</small><strong dir="auto">{details.android}</strong></span>}{typeof app.downloads==='number'&&app.downloads>0&&<span><small>التحميلات</small><strong>{new Intl.NumberFormat('ar').format(app.downloads)}</strong></span>}</div>
        <div className="detail-download-area"><DownloadActions name={name} appId={app.id} imageUrl={app.imageUrl} size={available(app.size)} href={download} external={Boolean(direct)} initialSaved={saved} signedIn={Boolean(user)} directFile={getDownloadPresentation(app.id)}/>{direct&&<a className="detail-alternate-download" href={telegramDownloadUrl(app.id)} target="_blank" rel="noopener noreferrer">التحميل عبر البوت ↗</a>}</div>
      </header>
      <div className="detail-content-grid"><div className="detail-main">
        {Boolean(details.screenshots?.length)&&<Screenshots images={details.screenshots!} name={name}/>}
        <section className="detail-section" aria-labelledby="description-title"><h2 id="description-title">{kind==='games'?'عن اللعبة':'عن التطبيق'}</h2>{app.description?<ExpandableDescription text={app.description}/>:<p className="detail-subtitle">لم يُضف وصف لهذا المحتوى بعد.</p>}</section>
        {details.changelog&&<section className="detail-section" aria-labelledby="changelog-title"><h2 id="changelog-title">ما الجديد؟</h2><p className="detail-description" dir="auto">{details.changelog}</p></section>}
        {details.modInfo&&<section className="detail-section" aria-labelledby="mod-title"><h2 id="mod-title">معلومات النسخة المعدلة <span className="app-badge" lang="en">MOD</span></h2><p className="detail-description" dir="auto">{details.modInfo}</p></section>}
      </div><aside className="detail-technical detail-section" aria-labelledby="technical-title"><h2 id="technical-title">المعلومات التقنية</h2><dl>{technical.map(([label,value])=><div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl></aside><div className="detail-version-section"><Versions items={details.versions||[]}/></div></div>
    </article>
    {related.length>0&&<section className="catalog-section detail-related" aria-labelledby="related-title"><SectionHeading id="related-title" title={kind==='games'?'ألعاب ذات صلة':'تطبيقات ذات صلة'} subtitle="من التصنيف أو المطوّر نفسه" href={categoryPath||undefined} linkLabel="عرض التصنيف"/><AppGrid apps={related}/></section>}
  </div>;
}
