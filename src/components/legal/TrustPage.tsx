
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import Link from 'next/link';
export default async function TrustPage({title,children}:{title:string;children:React.ReactNode}){
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  return <article className="shell trust-page"><Link className="view-all" href="/">{t("Waleed Zone — الرئيسية ←")}</Link><h1>{title}</h1><div className="trust-page-content">{children}</div></article>;
}
