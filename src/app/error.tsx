'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/15 bg-red-400/10 text-2xl font-black text-red-300">!</span>
      <h1 className="mt-5 text-2xl font-black text-white">صار خطأ غير متوقع</h1>
      <p className="mt-2 text-sm text-slate-500">جرّب إعادة تحميل المحتوى. إذا استمرت المشكلة فالمشكلة غالبًا مؤقتة.</p>
      <button type="button" onClick={() => reset()} className="accent-button mt-6 rounded-xl px-5 py-2.5 text-sm font-black">
        إعادة المحاولة
      </button>
    </main>
  );
}
