export default function Loading() {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#030712]/40 px-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 text-center shadow-2xl shadow-sky-950/30 backdrop-blur-2xl sm:p-7">
        <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-xl font-black text-white shadow-lg shadow-sky-500/20 ring-1 ring-white/15">
          W
        </div>

        <p className="mt-4 text-sm font-bold text-slate-100">جارٍ تجهيز المحتوى...</p>
        <p className="mt-1 text-xs text-slate-400">لحظات بسيطة ويظهر كل شيء</p>

        <div className="mt-5 overflow-hidden rounded-full bg-white/[0.06] p-[1px]">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/80">
            <div className="loading-line h-full w-1/3 rounded-full bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-500 shadow-[0_0_14px_rgba(56,189,248,0.65)]" />
          </div>
        </div>

        <span className="sr-only">جارٍ التحميل...</span>
      </div>
    </div>
  );
}
