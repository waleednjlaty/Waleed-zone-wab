import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="bg-gradient-to-br from-cyan-400 to-violet-500 bg-clip-text text-7xl font-black text-transparent">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-white">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        قد يكون التطبيق محذوفًا أو أن الرابط غير صحيح.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-cyan-400 hover:to-violet-500"
      >
        العودة إلى الرئيسية
      </Link>
    </main>
  );
}
