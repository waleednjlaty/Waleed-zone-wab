import {publicContactEmail} from '@/lib/public-contact';
import {TELEGRAM_BOT_URL,TELEGRAM_CHANNEL_URL} from '@/lib/site';
export default function ContactMethods(){
  const email=publicContactEmail();
  return <ul className="trust-contact-list">
    {email&&<li>البريد العام: <a href={`mailto:${email}`} dir="ltr">{email}</a></li>}
    <li><a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">بوت Waleed Zone</a> — التحميل والمساعدة المتاحة داخل البوت.</li>
    <li><a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">قناة Waleed Zone العامة</a> — التحديثات وبيانات التواصل المعلنة.</li>
  </ul>;
}
