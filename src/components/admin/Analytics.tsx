'use client';
import { useTranslateUI } from '@/components/LocaleProvider';

import {useEffect,useState} from 'react';
import {request,apiErrorMessage} from './api';
import styles from './admin.module.css';
const labels:Record<string,string>={detail_view:'مشاهدات التفاصيل',download_page_view:'مشاهدات صفحة التحميل',download_prepare:'تجهيزات التحميل',download_redeem:'الاستردادات الناجحة',telegram_redirect:'تحويلات Telegram',external_download_redirect:'تحويلات التحميل الخارجي'};
type Report={days:number;from:string;to:string;visitors:number;metrics:Record<string,number>;conversions:Record<string,number|null>;top:{application_id:number;name:string;views:number;redeems:number;conversion:number|null}[]};
const ratio=(value:number|null)=>value===null?'غير متاح':`${value}%`;
function parse(value:Record<string,unknown>):Report{
  const row=value as unknown as Report;
  if(![1,7,30].includes(row.days)||typeof row.from!=='string'||typeof row.to!=='string'||!Number.isSafeInteger(row.visitors)||row.visitors<0||!row.metrics||!row.conversions||!Array.isArray(row.top)||row.top.length>10)throw Error('INVALID_RESPONSE');
  // Older cached reports predate the additive external redirect counter.
  if(row.metrics.external_download_redirect===undefined)row.metrics={...row.metrics,external_download_redirect:0};
  if(Object.keys(labels).some(key=>!Number.isSafeInteger(row.metrics[key])||row.metrics[key]<0)||['detail_to_download','download_to_redeem','redeem_to_redirect'].some(key=>!(key in row.conversions))||Object.values(row.conversions).some(n=>n!==null&&(!Number.isFinite(n)||n<0))
    ||row.top.some(app=>!Number.isSafeInteger(app.application_id)||typeof app.name!=='string'||!Number.isSafeInteger(app.views)||app.views<0||!Number.isSafeInteger(app.redeems)||app.redeems<0||app.conversion!==null&&(!Number.isFinite(app.conversion)||app.conversion<0)))throw Error('INVALID_RESPONSE');
  return row;
}
export default function Analytics(){
  const t = useTranslateUI();

  const [days,setDays]=useState(1),[epoch,setEpoch]=useState(0),[report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    const abort=new AbortController();setReport(null);setError('');setLoading(true);
    request(`/api/admin/analytics?days=${days}&limit=10`,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted){const result=parse(value);if(result.days!==days)throw Error('INVALID_RESPONSE');setReport(result);}})
      .catch(e=>{if(!abort.signal.aborted)setError(apiErrorMessage(e));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[days,epoch]);
  return <section className={styles.panel} aria-labelledby="analytics-title"><div className={styles.panelHead}><h3 id="analytics-title">{t("تحليلات الموقع")}</h3><p>{t("عدادات أحداث مجمّعة بأفضل جهد. مجموع الزوار اليوميين ليس عدد أشخاص فريدين عبر الفترة. لا تُعرض إيرادات أو نقرات إعلانات.")}</p></div>
    <label htmlFor="analytics-window">{t("الفترة (UTC)")}</label><select id="analytics-window" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={1}>{t("اليوم")}</option><option value={7}>{t("7 أيام")}</option><option value={30}>{t("30 يومًا")}</option></select>
    <button className={styles.secondary} onClick={()=>setEpoch(v=>v+1)}>{t("تحديث التحليلات")}</button>
    {loading&&<p role="status" aria-busy="true">{t("جارٍ قراءة العدادات…")}</p>}{error&&<p role="alert">{t(error)}</p>}
    {report&&<><p dir="ltr">{report.from} → {report.to} (UTC)</p><div className={styles.stats}><div><span>{t("الزوار (مجموع يومي)")}</span><strong>{report.visitors}</strong></div>{Object.entries(labels).map(([key,label])=><div key={key}><span>{t(label)}</span><strong>{report.metrics[key]}</strong></div>)}</div>
      <h4>{t("نسب الأحداث")}</h4><p>{t("قد تتجاوز النسبة 100% لتكرار الأحداث؛ هذه ليست نسبة تحويل أشخاص أو إثبات اكتمال تنزيل الملف.")}</p><dl className={styles.gates}><div className={styles.gate}><dt>{t("التفاصيل ← صفحة التحميل")}</dt><dd>{t(ratio(report.conversions.detail_to_download))}</dd></div><div className={styles.gate}><dt>{t("صفحة التحميل ← الاسترداد")}</dt><dd>{t(ratio(report.conversions.download_to_redeem))}</dd></div><div className={styles.gate}><dt>{t("الاسترداد ← وجهة التحميل")}</dt><dd>{t(ratio(report.conversions.redeem_to_redirect))}</dd></div></dl>
      <h4>{t("أبرز التطبيقات حسب المشاهدات")}</h4>{report.top.length?<ul className={styles.recordList}>{report.top.map(app=><li key={app.application_id}><strong dir="auto">{app.name}</strong><p>{t("مشاهدات:")} {app.views}  {t("· استردادات:")} {app.redeems}  {t("· نسبة الاسترداد إلى المشاهدات:")} {t(ratio(app.conversion))}</p></li>)}</ul>:<p>{t("لا توجد أحداث تطبيقات خلال هذه الفترة.")}</p>}
    </>}
  </section>;
}
