'use client';
import { useEffect, useRef, useState } from 'react';
import CoverImage from '@/components/CoverImage';
import { adminApi, apiErrorMessage, AdminApiError, request } from './api';
import styles from './admin.module.css';
const statuses = {unreviewed:'غير مراجع',eligible:'مؤهل',blocked:'محظور'};
const bases = {unknown:'غير معروف',official:'رسمي',freeware:'مجاني بترخيص',open_source:'مفتوح المصدر',publisher_permission:'إذن الناشر',owner_created:'من إنشاء المالك',other_documented:'أساس موثق آخر'};
type Status = keyof typeof statuses;
type Basis = keyof typeof bases;
type Review = {application_id:number;name:string;icon:string|null;category:string|null;version:string|null;active:boolean;published:boolean;status:Status;rights_basis:Basis;review_notes:string;revision:string;reviewed_at:string|null};
type Page = {items:Review[];counts:Record<Status,number>;next_after:number|null;gates:Record<string,boolean>};
function parse(value:Record<string,unknown>):Review {
  if (!Number.isSafeInteger(value.application_id) || Number(value.application_id)<1 || typeof value.name!=='string'
    || typeof value.status!=='string' || !Object.hasOwn(statuses,value.status) || typeof value.rights_basis!=='string' || !Object.hasOwn(bases,value.rights_basis)
    || typeof value.review_notes!=='string' || value.review_notes.length>1000 || typeof value.revision!=='string' || !/^[a-f0-9]{64}$/.test(value.revision)
    || typeof value.active!=='boolean' || typeof value.published!=='boolean'
    || ['icon','category','version'].some(k=>value[k]!==null&&typeof value[k]!=='string')) throw new Error('INVALID_RESPONSE');
  return value as Review;
}
function parsePage(value:Record<string,unknown>):Page {
  if(!Array.isArray(value.items)||value.items.length>50||!value.counts||!value.gates)throw new Error('INVALID_RESPONSE');
  const counts=value.counts as Record<Status,number>,gates=value.gates as Record<string,boolean>;
  if(Object.keys(statuses).some(k=>!Number.isSafeInteger(counts[k as Status])||counts[k as Status]<0)||Object.values(gates).some(v=>typeof v!=='boolean'))throw new Error('INVALID_RESPONSE');
  const items=value.items.map(parse),next=value.next_after;
  if(next!==null&&(!Number.isSafeInteger(next)||next!==items.at(-1)?.application_id))throw new Error('INVALID_RESPONSE');
  return {items,counts,gates,next_after:next as number|null};
}
export default function MonetizationReview() {
  const [cursors,setCursors]=useState<(number|null)[]>([null]),[epoch,setEpoch]=useState(0),[page,setPage]=useState<Page|null>(null);
  const [row,setRow]=useState<Review|null>(null),[basis,setBasis]=useState<Basis>('unknown'),[notes,setNotes]=useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const lock=useRef(false),feedback=useRef<HTMLParagraphElement>(null);
  const after=cursors[cursors.length-1];
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setPage(null);setRow(null);setError('');
    request(`/api/admin/monetization?limit=50${after===null?'':`&after=${after}`}`,{signal:abort.signal})
      .then(value=>{if(!abort.signal.aborted)setPage(parsePage(value));})
      .catch(e=>{if(!abort.signal.aborted)setError(apiErrorMessage(e));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[after,epoch]);
  function select(value:Review){setRow(value);setBasis(value.rights_basis);setNotes(value.review_notes);setNotice('');}
  async function save(status:Status) {
    if(lock.current||!row||!page||error)return;
    lock.current=true;setBusy(true);setNotice('');
    let accepted=false;
    try {
      const token=await adminApi.csrf();
      const saved=parse(await request(`/api/admin/monetization/${row.application_id}`,{method:'PUT',csrf:token,
        body:{expected_revision:row.revision,status,rights_basis:basis,review_notes:notes.trim()}}));
      accepted=true;
      const confirmed=parse(await request(`/api/admin/monetization/${row.application_id}`));
      if(saved.revision!==confirmed.revision||confirmed.status!==status)throw new Error('UNCONFIRMED_WRITE');
      const updated=parsePage(await request(`/api/admin/monetization?limit=50${after===null?'':`&after=${after}`}`));
      setPage(updated);select(confirmed);setNotice('تم الحفظ وتأكيد المراجعة من الخادم. هذا لا يُشغّل الإعلانات.');
    } catch(e) {
      setRow(null);setPage(null);
      if(e instanceof AdminApiError&&e.status===409){setNotice('تعارض في النسخة. أُعيدت قراءة القائمة؛ افتح التطبيق وراجع بياناته قبل الحفظ.');setEpoch(v=>v+1);}
      else setError(accepted?'استلم الخادم الحفظ، لكن تعذر تأكيده. حدّث الحالة قبل أي إجراء جديد.':apiErrorMessage(e));
    } finally {lock.current=false;setBusy(false);feedback.current?.focus();}
  }
  const gateLabels:Record<string,string>={publisherConfigured:'معرّف الحساب',contentReviewed:'إقرار مراجعة المحتوى',siteApproved:'إقرار موافقة Google',privacyReady:'إقرار تجهيز CMP والخصوصية',enabled:'مفتاح العرض النهائي',serving:'اكتمال بوابات العرض',manualPlacementConfigured:'إعداد الموضع اليدوي وCMP'};
  return <section className={styles.panel} aria-labelledby="monetization-title">
    <div className={styles.panelHead}><h3 id="monetization-title">مراجعة أهلية الإعلانات</h3><p>المراجعة داخلية للمالك. مجاني أو رسمي لا يعني وجود حق إعادة توزيع؛ وثّق المصدر والترخيص. تغيير المحتوى يلغي أهليته السابقة.</p></div>
    <p ref={feedback} tabIndex={-1} role={error?'alert':'status'} aria-live="polite">{error||notice}</p>
    <button className={styles.secondary} disabled={busy} onClick={()=>setEpoch(v=>v+1)}>تحديث مراجعات الربح</button>
    {loading&&<p role="status" aria-busy="true">جارٍ قراءة المراجعات…</p>}
    {page&&<><div className={styles.stats}>{Object.entries(statuses).map(([key,label])=><div key={key}><span>{label}</span><strong>{page.counts[key as Status]}</strong><small>الكتالوج كاملًا</small></div>)}</div>
      <div className={styles.gates}>{Object.entries(gateLabels).map(([key,label])=><div className={styles.gate} key={key}><span>{label}</span><span className={`${styles.badge} ${page.gates[key]?styles.success:styles.warning}`}>{page.gates[key]?'مُقرّ / مُعدّ':'غير جاهز'}</span></div>)}</div>
      <p className={styles.warning}>هذه الإقرارات لا تتحقق من حساب Google. يظل عرض كل إعلان مشروطًا بأهلية الصفحة واستجابة CMP الفعلية.</p>
      <div className={styles.appList}>{page.items.map(item=><button key={item.application_id} className={styles.appRow} disabled={busy} onClick={()=>select(item)} aria-pressed={row?.application_id===item.application_id}>
        <span className={styles.identity}><span className={styles.appIcon}><CoverImage src={item.icon} alt="" aspectClassName="aspect-square"/></span><span><strong dir="auto">{item.name}</strong><small>{item.category||'بدون تصنيف'} · {item.version||'بدون إصدار'} · {item.active?'فعّال':'مؤرشف'} · {item.published?'منشور':'مسودة'}</small></span></span><span className={styles.badge}>{statuses[item.status]} · {bases[item.rights_basis]}</span>
      </button>)}</div>
      {!page.items.length&&<p>لا توجد تطبيقات في هذه الصفحة.</p>}
      <div className={styles.pagination}><button className={styles.secondary} disabled={busy||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>السابق</button><span>صفحة {cursors.length}</span><button className={styles.secondary} disabled={busy||page.next_after===null} onClick={()=>setCursors(v=>[...v,page.next_after])}>التالي</button></div>
    </>}
    {row&&<form className={styles.form} onSubmit={event=>event.preventDefault()}><fieldset disabled={busy}><legend>مراجعة {row.name}</legend><p>الحالة الحالية: {statuses[row.status]}</p>
      <label htmlFor="monetization-basis">أساس الحقوق</label><select id="monetization-basis" value={basis} onChange={e=>setBasis(e.target.value as Basis)}>{Object.entries(bases).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <label htmlFor="monetization-notes">ملاحظات داخلية ودليل الحقوق (حتى 1000 حرف)</label><textarea id="monetization-notes" maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/>
      <p>أضف مصدر الإذن أو الترخيص وسبب ملاءمة الصفحة لسياسات الناشر. لا تضع كلمات مرور أو بيانات شخصية.</p>
      <div className={styles.formActions}><button type="button" className={styles.primary} disabled={basis==='unknown'||!notes.trim()} onClick={()=>void save('eligible')}>تحديد كمؤهل</button><button type="button" className={styles.secondary} onClick={()=>void save('blocked')}>حظر الإعلانات</button><button type="button" className={styles.secondary} onClick={()=>void save('unreviewed')}>حفظ كغير مراجع</button></div>
    </fieldset></form>}
  </section>;
}
