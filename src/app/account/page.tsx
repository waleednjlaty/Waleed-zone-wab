
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import { redirect } from 'next/navigation';
import AppGrid from '@/components/AppGrid';
import LogoutButton from '@/components/LogoutButton';
import { authDb,ensureAuthTables,getCurrentUser } from '@/lib/auth';
import { getAppById } from '@/lib/queries';
export const dynamic='force-dynamic';
export async function generateMetadata() { const locale = await getLocale(), t = (text: string) => translateUI(locale, text); return {title:t("مكتبتي"),description:t("تطبيقاتك وألعابك المحفوظة في وليد زون."),robots:{index:false,follow:false}}; }
export default async function Account() {
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

 const user=await getCurrentUser();if(!user)redirect('/login');
 await ensureAuthTables();const sql=authDb();
 const rows=await sql`SELECT application_id FROM site_favorites WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
 const apps=(await Promise.all(rows.map(r=>getAppById(Number(r.application_id))))).filter((x):x is NonNullable<typeof x>=>Boolean(x));
 return <div className="shell min-h-[65vh] py-12"><div className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-8"><div><p className="eyebrow">MY ZONE</p><h1 className="mt-3 text-4xl font-black">{t("أهلًا،")} <bdi>{user.name}</bdi></h1><p className="mt-2 text-sm text-[#a6b5b8]">{t("هذه مكتبتك الخاصة.")} {new Intl.NumberFormat(locale).format(apps.length)}  {t("عناصر محفوظة.")}</p></div><LogoutButton/></div>
  <section className="py-9">{apps.length?<AppGrid apps={apps}/>:<div className="surface py-16 text-center"><p className="text-4xl text-[#d9f578]">♡</p><h2 className="mt-3 text-xl font-black">{t("مكتبتك لسه فاضية")}</h2><p className="mt-2 text-sm text-[#a6b5b8]">{t("افتح أي تطبيق واضغط «أضف إلى مكتبتي».")}</p></div>}</section>
 </div>;
}
