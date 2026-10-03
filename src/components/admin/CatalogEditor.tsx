'use client';
import { useEffect, useRef, useState } from 'react';
import { request, adminApi, apiErrorMessage, AdminApiError } from './api';
import styles from './admin.module.css';
const labels: Record<string,string>={name:'الاسم',description:'الوصف',version:'الإصدار',size:'الحجم',category:'التصنيف (مثال: ألعاب موبايل)',platform:'النظام',developer:'المطور',image_url:'رابط الصورة (HTTPS)'};
const empty=()=>Object.fromEntries(Object.keys(labels).map(k=>[k,'']));
type RecordView={id:number;revision:string;active:boolean;published:boolean;source:{channel_username:string;message_id:number}|null}&Record<string,unknown>;
function parse(value:Record<string,unknown>):RecordView{
  if(!Number.isInteger(value.id)||typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision)||typeof value.active!=='boolean'||typeof value.published!=='boolean')throw new Error('INVALID_RESPONSE');
  return value as RecordView;
}
export default function CatalogEditor({onChange}:{onChange:()=>void}){
  const [apps,setApps]=useState<{id:number;name:string}[]>([]),[after,setAfter]=useState<number|null>(null);
  const [row,setRow]=useState<RecordView|null>(null),[values,setValues]=useState(empty),[url,setUrl]=useState(''),[channel,setChannel]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');const lock=useRef(false),feedback=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const controller=new AbortController();adminApi.applications(null,controller.signal).then(v=>{setApps(v.items);setAfter(v.nextAfter);}).catch(e=>{if(!controller.signal.aborted)setNotice(apiErrorMessage(e));});return()=>controller.abort();},[]);
  async function load(id:number){const value=parse(await request(`/api/admin/catalog/${id}`));setRow(value);setValues(Object.fromEntries(Object.keys(labels).map(k=>[k,String(value[k]??'')])));setUrl('');setChannel('');setMessage('');}
  async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await action();}catch(e){
    if(e instanceof AdminApiError&&e.status===409){if(row){try{await load(row.id);}catch{setRow(null);setValues(empty());}}setNotice('تعارض في التعديل: أُعيدت قراءة النسخة الحالية. راجعها ثم احفظ مجددًا.');}
    else setNotice(apiErrorMessage(e));
  }finally{lock.current=false;setBusy(false);feedback.current?.focus();}}
  async function write(path:string,method:'POST'|'PATCH'|'PUT',body:unknown){
    const csrf=await adminApi.csrf();const result=parse(await request(path,{method,body,csrf}));await load(result.id);
    const list=await adminApi.applications();setApps(list.items);setAfter(list.nextAfter);setNotice('تم الحفظ وتأكيد الحالة من الخادم.');onChange();
  }
  return <section className={styles.panel} aria-labelledby="catalog-editor-heading"><div className={styles.panelHead}><h3 id="catalog-editor-heading">إنشاء وتعديل التطبيقات والألعاب</h3><p>تُحفظ الإضافة كمسودة. تظهر للزوار عند النشر والتفعيل.</p></div>
    <p tabIndex={-1} ref={feedback} role="status" aria-live="polite">{notice}</p>
    <div className={styles.formActions}><button disabled={busy} className={styles.secondary} onClick={()=>{setRow(null);setValues(empty());setUrl('');setChannel('');setMessage('');}}>تطبيق / لعبة جديدة</button><label>تعديل تطبيق <select disabled={busy} value={row?.id||''} onChange={e=>{if(e.target.value)void run(()=>load(Number(e.target.value)));}}><option value="">اختر تطبيقًا</option>{apps.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}{row&&!apps.some(a=>a.id===row.id)&&<option value={row.id}>{String(row.name)}</option>}</select></label>{after!==null&&<button disabled={busy} className={styles.secondary} onClick={()=>void run(async()=>{const next=await adminApi.applications(after);setApps(a=>[...a,...next.items]);setAfter(next.nextAfter);})}>المزيد</button>}</div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void run(()=>write(row?`/api/admin/catalog/${row.id}`:'/api/admin/catalog',row?'PATCH':'POST',{metadata:values,...(row?{expected_revision:row.revision}:{})}));}}><fieldset disabled={busy}><legend>{row?`بيانات التطبيق #${row.id}`:'بيانات المسودة الجديدة'}</legend><div className={styles.formGrid}>{Object.entries(labels).map(([key,label])=><label key={key}>{label}{key==='description'?<textarea maxLength={1000} value={values[key]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>:<input required={key==='name'} type={key==='image_url'?'url':'text'} value={values[key]} maxLength={key==='image_url'?500:key==='name'||key==='developer'?255:key==='category'?100:50} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>}</label>)}</div><button className={styles.primary} type="submit">{row?'حفظ التعديل':'حفظ المسودة'}</button></fieldset></form>
    {row&&<><p>الحالة: {row.active?'فعّال':'مؤرشف'} · {row.published?'منشور':'مسودة'}</p><div className={styles.formActions}>{(['publish','unpublish','archive','activate'] as const).map((action,i)=><button key={action} disabled={busy||(action==='publish'&&!row.active)} className={styles.secondary} onClick={()=>void run(()=>write(`/api/admin/catalog/${row.id}`,'PATCH',{action,expected_revision:row.revision}))}>{['نشر','إلغاء النشر','أرشفة / تعطيل','إعادة تفعيل كمسودة'][i]}</button>)}</div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void run(()=>write(`/api/admin/catalog/${row.id}/source`,'PUT',{expected_revision:row.revision,source:url?{url}:{channel_username:channel,message_id:message}}));}}><fieldset disabled={busy}><legend>ربط ملف Telegram</legend><p>{row.source?`ملف مرتبط: @${row.source.channel_username} · رسالة ${row.source.message_id}`:'لا يوجد ملف Telegram مرتبط.'}</p><label>رابط الرسالة <input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://t.me/channel/123"/></label><p>أو أدخل القناة ورقم الرسالة:</p><label>اسم القناة <input value={channel} disabled={!!url} onChange={e=>setChannel(e.target.value)}/></label><label>رقم الرسالة <input inputMode="numeric" value={message} disabled={!!url} onChange={e=>setMessage(e.target.value)}/></label><button type="submit" className={styles.primary}>حفظ مصدر الملف</button></fieldset></form></>}
  </section>;
}
