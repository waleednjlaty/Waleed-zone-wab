import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import LogoutButton from '@/components/LogoutButton';
import { authDb,ensureAuthTables,getCurrentUser } from '@/lib/auth';
import { getAppById } from '@/lib/queries';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'مكتبتي',description:'تطبيقاتك وألعابك المحفوظة في وليد زون.',robots:{index:false,follow:false}};
export default async function Account() {
 const user=await getCurrentUser();if(!user)redirect('/login');
 await ensureAuthTables();const sql=authDb();
 const rows=await sql`SELECT application_id FROM site_favorites WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
 const apps=(await Promise.all(rows.map(r=>getAppById(Number(r.application_id))))).filter((x):x is NonNullable<typeof x>=>Boolean(x));
 return <div className="shell min-h-[65vh] py-12"><div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8"><div><p className="eyebrow">MY ZONE</p><h1 className="mt-3 text-4xl font-black">أهلًا، {user.name}</h1><p className="mt-2 text-sm text-[#a6b5b8]">هذه مكتبتك الخاصة. {apps.length} عناصر محفوظة.</p><div className="mt-4 max-w-xl rounded-2xl border border-[#22C7E8]/25 bg-[#22C7E8]/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#22C7E8]">معرّف الحساب المؤقت</p><code className="mt-2 block break-all text-sm text-[#F4F6F8]">{user.id}</code><p className="mt-2 text-xs leading-5 text-[#a6b5b8]">انسخ هذا المعرّف فقط لإعداد OWNER_USER_ID، وبعدها سنزيله من الصفحة.</p></div></div><LogoutButton/></div>
  <section className="py-9">{apps.length?<AppGrid apps={apps}/>:<div className="surface py-16 text-center"><p className="text-4xl text-[#d9f578]">♡</p><h2 className="mt-3 text-xl font-black">مكتبتك لسه فاضية</h2><p className="mt-2 text-sm text-[#a6b5b8]">افتح أي تطبيق واضغط «أضف إلى مكتبتي».</p></div>}</section>
 </div>;
}
