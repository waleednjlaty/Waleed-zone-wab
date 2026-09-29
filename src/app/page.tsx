import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import AppGrid from '@/components/AppGrid';
import CategoryPills from '@/components/CategoryPills';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import SearchBar from '@/components/SearchBar';
import { getApps, getCategories } from '@/lib/queries';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';
import { parsePage, sanitizeSearch } from '@/lib/utils';
export const dynamic = 'force-dynamic';
interface Props { searchParams: Promise<Record<string,string|string[]|undefined>>; }
const first = (v:string|string[]|undefined) => Array.isArray(v) ? v[0] : v;
export async function generateMetadata({searchParams}:Props):Promise<Metadata> {
  const params = await searchParams;
  const q = sanitizeSearch(first(params?.q) || ''), category = sanitizeSearch(first(params?.category) || ''), page = parsePage(first(params?.page));
  if (q || category || page > 1) return {title:q ? `بحث: ${q}` : category ? `فئة ${category}` : `صفحة ${page}`, description:`نتائج ${q || category || `الصفحة ${page}`} في مكتبة وليد زون للتطبيقات والألعاب.`, robots:{index:false,follow:true}, alternates:{canonical:'/'} };
  return { title:'تطبيقات وألعاب للتحميل', description:'اكتشف التطبيقات وألعاب الكمبيوتر والموبايل في وليد زون. تصفح الفئات، اقرأ تفاصيل الإصدار، وحمّل عبر الرابط أو بوت تيليجرام.', alternates:{canonical:'/'} };
}
export default async function Home({searchParams}:Props) {
  const params = await searchParams;
  const q=sanitizeSearch(first(params?.q)||''), category=sanitizeSearch(first(params?.category)||''), page=parsePage(first(params?.page));
  const [result,categories]=await Promise.all([getApps({q,category,page,limit:12}),getCategories()]);
  return <>
    <section className="hero-grid relative overflow-hidden bg-[#173b3b] text-white"><div className="shell grid gap-10 py-14 md:grid-cols-[1.3fr_.7fr] md:items-center md:py-24">
      <div><p className="mb-5 inline-flex rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-[#d7e8e2]">مكتبتك الرقمية بالعربي · WALEED ZONE</p>
        <h1 className="max-w-2xl text-4xl font-black leading-[1.25] sm:text-5xl lg:text-6xl">كل لعبة وتطبيق <span className="text-[#f3aa83]">بمكان واحد.</span></h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-[#c2d7d0]">اكتشف الإضافات الجديدة، تعرّف على الإصدار والمنصة والحجم، ووصل لرابط التحميل أو اطلب اللي ناقصك من البوت.</p>
        <div className="mt-8 max-w-xl"><Suspense fallback={null}><SearchBar /></Suspense></div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-bold"><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-[#f3aa83] hover:underline">تابع جديد القناة ↗</a><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">اطلب تطبيقًا من البوت ↗</a></div>
      </div>
      <div className="relative hidden rounded-[28px] border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-sm md:block" aria-hidden="true"><div className="rounded-2xl bg-[#f6f5f0] p-5 text-[#142426]"><div className="mb-7 flex items-center justify-between"><span className="text-xs font-black tracking-widest">EXPLORE / 01</span><span className="h-3 w-3 rounded-full bg-[#e36b42]" /></div><div className="mb-4 grid grid-cols-3 gap-2"><div className="h-24 rounded-xl bg-[#deede7]"/><div className="h-24 rounded-xl bg-[#f3d9c8]"/><div className="h-24 rounded-xl bg-[#cedad6]"/></div><div className="h-3 w-3/4 rounded-full bg-[#cedad6]"/><div className="mt-3 h-3 w-1/2 rounded-full bg-[#e3e9e5]"/></div><div className="mt-4 flex items-center justify-between text-sm font-bold"><span>{result.total} إضافة منشورة</span><span>{categories.length} فئات</span></div></div>
    </div></section>
    <section id="explore" className="shell py-12 sm:py-16"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">EXPLORE THE LIBRARY</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">استكشف حسب اهتمامك</h2></div><p className="text-sm text-[#667577]">{categories.length} فئات متاحة</p></div><CategoryPills categories={categories} active={category||undefined} q={q||undefined}/>
      <div className="mb-6 mt-12 flex items-end justify-between gap-3 border-b border-[#dce3df] pb-5"><div><p className="eyebrow">FRESH PICKS</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{q ? `نتائج «${q}»` : category || 'أحدث الإضافات'}</h2></div><span className="rounded-full bg-[#e7ece8] px-3 py-1.5 text-xs font-bold">{result.total} نتيجة</span></div>
      {result.items.length ? <><AppGrid apps={result.items}/><div className="mt-10"><Pagination currentPage={result.currentPage} totalPages={result.totalPages} q={q||undefined} category={category||undefined}/></div></> : <EmptyState hasQuery={Boolean(q||category)}/>}
    </section>
    <section className="bg-[#e8eee9]"><div className="shell flex flex-col gap-5 py-12 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">محتوى جديد باستمرار</p><h2 className="mt-2 text-2xl font-black">ما لقيت اللي بدك ياه؟</h2><p className="mt-2 text-sm text-[#667577]">أرسل طلبك للبوت وتابع القناة لمعرفة الجديد.</p></div><a className="primary-action w-fit" href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">افتح بوت وليد زون ↗</a></div></section>
  </>;
}
