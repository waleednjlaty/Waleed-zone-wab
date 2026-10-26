'use client';
import { useTranslateUI } from '@/components/LocaleProvider';

import { useEffect, useRef, useState } from 'react';
import { request, adminApi, apiErrorMessage, AdminApiError } from './api';
import styles from './admin.module.css';
const labels: Record<string,string>={name:'الاسم',description:'الوصف',version:'الإصدار',size:'الحجم',category:'التصنيف (مثال: ألعاب موبايل)',platform:'النظام',developer:'المطور',image_url:'رابط الصورة (HTTPS)'};
const empty=()=>Object.fromEntries(Object.keys(labels).map(k=>[k,'']));
type RecordView={id:number;revision:string;active:boolean;published:boolean;source:{channel_username:string;message_id:number}|null}&Record<string,unknown>;
type SuggestedApp = {
  id: number; name: string; description: string | null; version: string | null; size: string | null;
  category: string | null; platform: string | null; developer: string | null; image_url: string | null;
  active: boolean; published: boolean; confidence: number; reason: string; duplicateVersion: boolean;
};
function parseSuggestions(value:Record<string,unknown>) {
  if (value.provider !== 'openai' && value.provider !== 'similarity') throw new Error('INVALID_RESPONSE');
  if (!Array.isArray(value.items) || value.items.length > 5) throw new Error('INVALID_RESPONSE');
  const items = value.items.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_RESPONSE');
    const row = raw as Record<string, unknown>;
    if (!Number.isInteger(row.id) || typeof row.name !== 'string' || typeof row.confidence !== 'number'
      || !Number.isFinite(row.confidence) || typeof row.reason !== 'string' || typeof row.duplicateVersion !== 'boolean') throw new Error('INVALID_RESPONSE');
    const nullable = (key: string) => row[key] === null || typeof row[key] === 'string' ? row[key] as string | null : (() => { throw new Error('INVALID_RESPONSE'); })();
    return { id: row.id as number, name: row.name, description: nullable('description'), version: nullable('version'), size: nullable('size'),
      category: nullable('category'), platform: nullable('platform'), developer: nullable('developer'), image_url: nullable('image_url'),
      active: row.active === true, published: row.published === true, confidence: Math.max(0,Math.min(1,row.confidence)), reason: row.reason, duplicateVersion: row.duplicateVersion };
  }) as SuggestedApp[];
  return { provider: value.provider as 'openai'|'similarity', items };
}
function parse(value:Record<string,unknown>):RecordView{
  if(!Number.isInteger(value.id)||typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision)||typeof value.active!=='boolean'||typeof value.published!=='boolean')throw new Error('INVALID_RESPONSE');
  return value as RecordView;
}
export default function CatalogEditor({onChange}:{onChange:()=>void}){
  const t = useTranslateUI();

  const [apps,setApps]=useState<{id:number;name:string;version?:string|null;platform?:string|null}[]>([]),[after,setAfter]=useState<number|null>(null);
  const [row,setRow]=useState<RecordView|null>(null),[copyFrom,setCopyFrom]=useState<number|null>(null),[values,setValues]=useState(empty),[url,setUrl]=useState(''),[channel,setChannel]=useState(''),[message,setMessage]=useState('');
  const [suggestions,setSuggestions]=useState<SuggestedApp[]>([]),[suggestionEngine,setSuggestionEngine]=useState<'openai'|'similarity'|''>(''),[suggesting,setSuggesting]=useState(false);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');const lock=useRef(false),feedback=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const controller=new AbortController();adminApi.applications(null,controller.signal).then(v=>{setApps(v.items);setAfter(v.nextAfter);}).catch(e=>{if(!controller.signal.aborted)setNotice(apiErrorMessage(e));});return()=>controller.abort();},[]);
  async function load(id:number){const value=parse(await request(`/api/admin/catalog/${id}`));setRow(value);setCopyFrom(null);setValues(Object.fromEntries(Object.keys(labels).map(k=>[k,String(value[k]??'')])));setUrl('');setChannel('');setMessage('');}
  function startNewApp(){setRow(null);setCopyFrom(null);setValues(empty());setUrl('');setChannel('');setMessage('');setSuggestions([]);setSuggestionEngine('');setNotice('');}
  function startNewRelease(){
    if(!row)return;
    setCopyFrom(row.id);
    setValues(Object.fromEntries(Object.keys(labels).map(k=>[k,k==='version'||k==='size'?'':String(row[k]??'')])));
    setRow(null);setUrl('');setChannel('');setMessage('');setSuggestions([]);setSuggestionEngine('');
    setNotice(t("إنشاء إصدار جديد من {0}. أدخل رقم إصدار جديدًا؛ الإصدار القديم سيبقى كما هو.", String(row.name)));
  }
  async function run(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{await action();}catch(e){
    if(e instanceof AdminApiError&&e.status===409){if(row){try{await load(row.id);}catch{setRow(null);setValues(empty());}}setNotice('تعارض في التعديل: أُعيدت قراءة النسخة الحالية. راجعها ثم احفظ مجددًا.');}
    else setNotice(apiErrorMessage(e));
  }finally{lock.current=false;setBusy(false);feedback.current?.focus();}}
  async function suggestMatches() {
    if (row) return;
    if (!String(values.name || '').trim() || !String(values.version || '').trim() || !String(values.platform || '').trim()) {
      setNotice(t("أدخل اسم التطبيق والإصدار والنظام أولًا للحصول على اقتراحات دقيقة."));
      return;
    }
    setSuggesting(true);setNotice('');setSuggestions([]);setSuggestionEngine('');
    try {
      const csrf = await adminApi.csrf();
      const response = await request('/api/admin/catalog/suggestions', { method: 'POST',
        body: { name: String(values.name).trim(), version: String(values.version).trim(), platform: String(values.platform).trim() }, csrf });
      const parsed = parseSuggestions(response);
      setSuggestions(parsed.items);setSuggestionEngine(parsed.provider);
      setNotice(parsed.items.length ? t("راجع الاقتراحات واختر التطبيق الصحيح يدويًا؛ لن تُحفظ أي بيانات قبل موافقتك.") : t("لم أجد تطبيقًا قريبًا بما يكفي. يمكنك إكمال الإضافة يدويًا."));
    } catch (error) { setNotice(apiErrorMessage(error)); }
    finally { setSuggesting(false); }
  }
  function acceptSuggestion(item: SuggestedApp) {
    if (item.duplicateVersion) { setNotice(t("هذا الإصدار مسجّل بالفعل. افتح السجل الموجود لتعديله بدل إنشاء نسخة مكررة.")); return; }
    const version = String(values.version || '');
    setRow(null);setCopyFrom(item.id);setSuggestions([]);setSuggestionEngine('');
    setValues(v=>({...v,name:item.name,description:item.description ?? v.description,version, size:'',category:item.category ?? v.category,
      platform:item.platform ?? v.platform,developer:item.developer ?? v.developer,image_url:item.image_url ?? v.image_url}));
    setNotice(t("تم اعتماد اقتراح التطبيق #{0}؛ راجع الاسم والنظام ورقم الإصدار ثم احفظ. السجل القديم سيبقى دون تغيير.",item.id));
  }
  async function write(path:string,method:'POST'|'PATCH'|'PUT',body:unknown){
    const csrf=await adminApi.csrf();const result=parse(await request(path,{method,body,csrf}));await load(result.id);setCopyFrom(null);
    const list=await adminApi.applications();setApps(list.items);setAfter(list.nextAfter);setNotice('تم الحفظ وتأكيد الحالة من الخادم.');onChange();
  }
  return <section className={styles.panel} aria-labelledby="catalog-editor-heading"><div className={styles.panelHead}><h3 id="catalog-editor-heading">{t("إنشاء وتعديل التطبيقات والألعاب")}</h3><p>{t("تُحفظ الإضافة كمسودة. تظهر للزوار عند النشر والتفعيل.")}</p></div>
    <p tabIndex={-1} ref={feedback} role="status" aria-live="polite">{t(notice)}</p>
    <div className={styles.formActions}><button disabled={busy} className={styles.secondary} onClick={startNewApp}>{t("تطبيق / لعبة جديدة")}</button>{row&&<button disabled={busy} className={styles.secondary} onClick={startNewRelease}>{t("إضافة إصدار جديد لهذا التطبيق")}</button>}<label>{t("تعديل تطبيق / إصدار")} <select disabled={busy} value={row?.id||''} onChange={e=>{if(e.target.value)void run(()=>load(Number(e.target.value)));}}><option value="">{t("اختر تطبيقًا وإصدارًا")}</option>{apps.map(a=><option key={a.id} value={a.id}>{a.name} · {a.version||t("إصدار غير محدد")} · {a.platform||t("نظام غير محدد")} · #{a.id}</option>)}{row&&!apps.some(a=>a.id===row.id)&&<option value={row.id}>{String(row.name)} · {String(row.version||t("إصدار غير محدد"))} · #{row.id}</option>}</select></label>{after!==null&&<button disabled={busy} className={styles.secondary} onClick={()=>void run(async()=>{const next=await adminApi.applications(after);setApps(a=>[...a,...next.items]);setAfter(next.nextAfter);})}>{t("المزيد")}</button>}</div>
    {copyFrom!==null&&<p className={styles.warning}>{t("تُنشأ نسخة إصدار جديدة كسجل مستقل؛ لا يتغير ملف الإصدار الأصلي ولا رابط تنزيله.")} {t("الإصدار الأساسي")} #{copyFrom}</p>}
    {!row&&<div className={styles.panel} aria-labelledby="release-suggest-heading">
      <div className={styles.panelHead}><h3 id="release-suggest-heading">{t("مساعد التعرّف على التطبيق")}</h3><p>{t("يقارن الاسم والنظام والإصدار ويقترح سجلات قريبة. القرار النهائي لك، ولا يتم أي ربط تلقائي.")}</p></div>
      <div className={styles.formActions}><button type="button" className={styles.secondary} disabled={busy||suggesting} onClick={()=>void suggestMatches()}>{suggesting?t("جارٍ تحليل الكتالوج…"):t("🤖 اقتراح تطبيق مطابق")}</button></div>
      {suggestionEngine&&<p className={styles.muted}>{suggestionEngine==='openai'?t("تم ترتيب النتائج بالذكاء الاصطناعي. يلزم تأكيدك دائمًا."):t("مفتاح الذكاء الاصطناعي غير مهيأ؛ هذه اقتراحات تشابه للاسم والنظام وليست قرارًا آليًا.")}</p>}
      {suggestions.length>0&&<ul className={styles.recordList}>{suggestions.map(item=><li key={item.id}>
        <div className={styles.recordHead}><strong dir="auto">{item.name}</strong><span>{Math.round(item.confidence*100)}% {t("تشابه")}</span></div>
        <small dir="auto">{t("الإصدار")} {item.version||'—'} · {item.platform||t("نظام غير محدد")} · #{item.id}</small>
        <p>{item.reason}</p>
        {item.duplicateVersion&&<p className={styles.warning}>{t("رقم الإصدار نفسه موجود؛ لن ننشئ نسخة مكررة.")}</p>}
        <button type="button" className={styles.secondary} disabled={busy||item.duplicateVersion} onClick={()=>acceptSuggestion(item)}>{t("نعم، هذا هو التطبيق الصحيح")}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={()=>setSuggestions(current=>current.filter(candidate=>candidate.id!==item.id))}>{t("لا، تطبيق مختلف")}</button>
      </li>)}</ul>}
    </div>}
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void run(()=>write(row?`/api/admin/catalog/${row.id}`:'/api/admin/catalog',row?'PATCH':'POST',{metadata:values,...(row?{expected_revision:row.revision}:{})}));}}><fieldset disabled={busy}><legend>{row?t("تعديل الإصدار / التطبيق #{0}", row.id):copyFrom!==null?t("بيانات الإصدار الجديد"):t("بيانات المسودة الجديدة")}</legend><div className={styles.formGrid}>{Object.entries(labels).map(([key,label])=><label key={key}>{t(label)}{key==='description'?<textarea maxLength={1000} value={values[key]} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>:<input required={key==='name'||(!row&&(key==='version'||key==='platform'))} placeholder={key==='version'?'مثال: 19.8.0':undefined} type={key==='image_url'?'url':'text'} value={values[key]} maxLength={key==='image_url'?500:key==='name'||key==='developer'?255:key==='category'?100:50} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));if(key==='name'||key==='version'||key==='platform'){setSuggestions([]);setSuggestionEngine('');}}}/>}</label>)}</div><button className={styles.primary} type="submit">{row?t("حفظ التعديل"):copyFrom!==null?t("إنشاء الإصدار الجديد"):t("حفظ المسودة")}</button></fieldset></form>
    {row&&<><p>{t("الحالة:")} {row.active?t("فعّال"):t("مؤرشف")} · {row.published?t("منشور"):t("مسودة")}</p><div className={styles.formActions}>{(['publish','unpublish','archive','activate'] as const).map((action,i)=><button key={action} disabled={busy||(action==='publish'&&!row.active)} className={styles.secondary} onClick={()=>void run(()=>write(`/api/admin/catalog/${row.id}`,'PATCH',{action,expected_revision:row.revision}))}>{[t("نشر"),t("إلغاء النشر"),t("أرشفة / تعطيل"),t("إعادة تفعيل كمسودة")][i]}</button>)}</div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void run(()=>write(`/api/admin/catalog/${row.id}/source`,'PUT',{expected_revision:row.revision,source:url?{url}:{channel_username:channel,message_id:message}}));}}><fieldset disabled={busy}><legend>{t("ربط ملف Telegram")}</legend><p>{row.source?t("ملف مرتبط: @{0} · رسالة {1}", row.source.channel_username, row.source.message_id):t("لا يوجد ملف Telegram مرتبط.")}</p><label>{t("رابط الرسالة")} <input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://t.me/channel/123"/></label><p>{t("أو أدخل القناة ورقم الرسالة:")}</p><label>{t("اسم القناة")} <input value={channel} disabled={!!url} onChange={e=>setChannel(e.target.value)}/></label><label>{t("رقم الرسالة")} <input inputMode="numeric" value={message} disabled={!!url} onChange={e=>setMessage(e.target.value)}/></label><button type="submit" className={styles.primary}>{t("حفظ مصدر الملف")}</button></fieldset></form></>}
  </section>;
}
