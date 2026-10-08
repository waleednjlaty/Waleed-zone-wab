
import { getLocale } from '@/lib/locale-server';
import { translateUI } from '@/lib/ui-translations';
import {publicContactEmail} from '@/lib/public-contact';
import {TELEGRAM_BOT_URL,TELEGRAM_CHANNEL_URL} from '@/lib/site';
export default async function ContactMethods(){
  const locale = await getLocale(), t = (text: string, ...values: unknown[]) => translateUI(locale, text, ...values);

  const email=publicContactEmail();
  return <ul className="trust-contact-list">
    {email&&<li>{t("البريد العام:")} <a href={`mailto:${email}`} dir="ltr">{email}</a></li>}
    <li><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">{t("بوت Waleed Zone")}</a>  {t("— التحميل والمساعدة المتاحة داخل البوت.")}</li>
    <li><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">{t("قناة Waleed Zone العامة")}</a>  {t("— التحديثات وبيانات التواصل المعلنة.")}</li>
  </ul>;
}
