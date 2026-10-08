'use client';
import { useTranslateUI } from '@/components/LocaleProvider';


export default function AdminError({ reset }: { reset: () => void }) {
  const t = useTranslateUI();

  return <section className="shell empty-state" role="alert">
    <h1>{t("تعذر فتح لوحة المالك")}</h1>
    <p>{t("تحقق من جلستك ثم أعد المحاولة.")}</p>
    <button className="secondary-action" onClick={reset}>{t("إعادة المحاولة")}</button>
  </section>;
}
