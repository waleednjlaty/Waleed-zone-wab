import Link from 'next/link';

export default function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="panel flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025] text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
      </span>
      <h2 className="mt-5 text-xl font-black text-white">ما لقينا نتيجة</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasQuery ? 'جرّب اسم أقصر، كلمة ثانية، أو ارجع وشوف كل محتوى المكتبة.' : 'ما في محتوى متاح حاليًا بهذا القسم.'}
      </p>
      {hasQuery ? (
        <Link href="/" className="accent-button mt-6 rounded-xl px-5 py-2.5 text-sm font-black">
          عرض كل المكتبة
        </Link>
      ) : null}
    </div>
  );
}
