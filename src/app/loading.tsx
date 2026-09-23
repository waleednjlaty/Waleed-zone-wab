function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={'animate-pulse rounded-xl bg-slate-800/70 ' + className} />;
}

function AppCardSkeleton() {
  return (
    <article
      className="overflow-hidden rounded-[1.35rem] border border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950/90"
      aria-hidden="true"
    >
      <SkeletonBlock className="aspect-[16/10] w-full rounded-none bg-slate-800/80" />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full" />
        </div>

        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-3.5 w-full" />
          <SkeletonBlock className="h-3.5 w-4/5" />
        </div>

        <div className="mt-4 flex gap-2">
          <SkeletonBlock className="h-7 w-16 rounded-lg" />
          <SkeletonBlock className="h-7 w-14 rounded-lg" />
          <SkeletonBlock className="h-7 w-20 rounded-lg" />
        </div>

        <div className="mt-5 border-t border-slate-800/80 pt-4">
          <SkeletonBlock className="h-4 w-36" />
        </div>
      </div>
    </article>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">جارٍ تحميل المحتوى...</span>

      <section className="relative isolate overflow-hidden" aria-hidden="true">
        <div className="bg-grid absolute inset-0 -z-20" />
        <div className="pointer-events-none absolute -right-24 top-10 -z-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-28 -z-10 h-72 w-72 rounded-full bg-indigo-600/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20 md:pb-20 md:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <SkeletonBlock className="mx-auto h-8 w-40 rounded-full bg-sky-400/10" />

            <div className="mx-auto mt-6 space-y-3">
              <SkeletonBlock className="mx-auto h-11 w-[78%] max-w-2xl sm:h-14" />
              <SkeletonBlock className="mx-auto h-11 w-[58%] max-w-xl sm:h-14" />
            </div>

            <div className="mx-auto mt-6 max-w-2xl space-y-2">
              <SkeletonBlock className="mx-auto h-4 w-full max-w-xl" />
              <SkeletonBlock className="mx-auto h-4 w-4/5 max-w-lg" />
            </div>

            <SkeletonBlock className="mx-auto mt-8 h-14 max-w-2xl rounded-2xl sm:mt-10" />

            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock
                  key={index}
                  className={'h-9 rounded-full ' + (index % 3 === 0 ? 'w-24' : index % 3 === 1 ? 'w-20' : 'w-28')}
                />
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-44" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24" aria-hidden="true">
        <div className="mb-7 flex items-end justify-between gap-4 border-b border-slate-800/70 pb-5">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="h-7 w-40" />
          </div>
          <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <AppCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
