import Link from 'next/link';
import type { ReactNode } from 'react';
import CoverImage from '@/components/CoverImage';
import type { Application } from '@/lib/queries';

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[10px] font-bold text-slate-500">
      {children}
    </span>
  );
}

export default function AppCard({ app }: { app: Application }) {
  const appName = app.name ?? 'تطبيق ' + app.id;

  return (
    <article className="card-hover group overflow-hidden rounded-2xl border border-white/[0.065] bg-[#0d1218]">
      <Link href={'/app/' + app.id} className="flex h-full flex-col">
        <div className="relative overflow-hidden border-b border-white/[0.05] bg-[#0a0e13]">
          <CoverImage
            src={app.imageUrl}
            alt={appName}
            aspectClassName="aspect-[16/10]"
            imgClassName="transition duration-500 ease-out group-hover:scale-[1.035]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0d1218] to-transparent" aria-hidden="true" />
          {app.category ? (
            <span className="absolute right-3 top-3 rounded-lg border border-black/30 bg-black/70 px-2.5 py-1 text-[10px] font-black text-slate-200 backdrop-blur">
              {app.category}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-black text-white">{appName}</h2>
              <p className="mt-1 line-clamp-2 min-h-[2.6rem] text-[13px] leading-5 text-slate-500">
                {app.description || 'تفاصيل وتحميل التطبيق من Waleed Zone.'}
              </p>
            </div>
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-slate-500 transition group-hover:border-cyan-300/20 group-hover:text-cyan-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M8 7h9v9" />
              </svg>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {app.version ? <Tag>{app.version}</Tag> : null}
            {app.size ? <Tag>{app.size}</Tag> : null}
            {app.platform ? <Tag>{app.platform}</Tag> : null}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] pt-4 text-xs font-bold">
            <span className="text-slate-500">عرض التفاصيل</span>
            <span className="text-cyan-300 transition group-hover:-translate-x-1">←</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
