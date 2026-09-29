import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-7xl font-black tracking-tighter text-[#e36b42]">404</p>
      <h1 className="mt-4 text-2xl font-black text-[#142426]">الصفحة مو موجودة</h1>
      <p className="mt-2 text-sm leading-6 text-[#667577]">ممكن الرابط قديم، أو التطبيق انحذف من المكتبة.</p>
      <Link href="/" className="primary-action mt-6 rounded-xl px-5 py-2.5 text-sm font-black">العودة للمكتبة</Link>
    </main>
  );
}
