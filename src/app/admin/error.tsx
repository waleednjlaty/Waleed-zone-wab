'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="shell empty-state" role="alert">
    <h1>تعذر فتح لوحة المالك</h1>
    <p>تحقق من جلستك ثم أعد المحاولة.</p>
    <button className="secondary-action" onClick={reset}>إعادة المحاولة</button>
  </section>;
}
