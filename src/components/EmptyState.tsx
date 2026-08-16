import Link from 'next/link';

export default function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="h-12 w-12 text-slate-600"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
        />
      </svg>
      <h2 className="mt-4 text-xl font-semibold text-white">لا توجد نتائج</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        {hasQuery
          ? 'لم نعثر على تطبيقات تطابق بحثك. جرّب كلمات أخرى أو تصفح كل التطبيقات.'
          : 'لا توجد تطبيقات متاحة حاليًا في هذا القسم.'}
      </p>
      {hasQuery ? (
        <Link
          href="/"
          className="mt-6 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-cyan-400 hover:to-violet-500"
        >
          عرض كل التطبيقات
        </Link>
      ) : null}
    </div>
  );
}
