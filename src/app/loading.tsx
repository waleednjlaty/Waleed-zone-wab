function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={'animate-pulse rounded-lg bg-white/[0.055] ' + className} />;
}

function CardSkeleton() {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1218]" aria-hidden="true">
      <SkeletonBlock className="aspect-[16/10] w-full rounded-none" />
      <div className="p-4">
        <SkeletonBlock className="h-5 w-2/3" />
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-4/5" />
        </div>
        <div className="mt-4 flex gap-2">
          <SkeletonBlock className="h-6 w-14" />
          <SkeletonBlock className="h-6 w-16" />
        </div>
        <div className="mt-4 border-t border-white/[0.05] pt-4">
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
    </article>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل المحتوى...</span>

      <section className="border-b border-white/[0.05]" aria-hidden="true">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)] lg:items-end lg:gap-16 lg:py-20">
          <div>
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="mt-5 h-11 w-[82%] max-w-2xl sm:h-14" />
            <SkeletonBlock className="mt-3 h-11 w-[62%] max-w-xl sm:h-14" />
            <SkeletonBlock className="mt-6 h-4 w-full max-w-xl" />
            <SkeletonBlock className="mt-2 h-4 w-4/5 max-w-lg" />
            <SkeletonBlock className="mt-7 h-14 w-full max-w-2xl rounded-2xl" />
          </div>
          <div className="panel rounded-2xl p-5 sm:p-6">
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="mt-3 h-9 w-16" />
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-5">
              <SkeletonBlock className="h-12 w-full" />
              <SkeletonBlock className="h-12 w-full" />
            </div>
            <SkeletonBlock className="mt-5 h-11 w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 sm:pb-24 sm:pt-9" aria-hidden="true">
        <div className="mb-8 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10 w-24 shrink-0 rounded-xl" />
          ))}
        </div>

        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="mt-2 h-7 w-40" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <CardSkeleton key={index} />)}
        </div>
      </section>
    </div>
  );
}
