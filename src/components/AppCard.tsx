import Link from 'next/link';
import type { ReactNode } from 'react';
import CoverImage from '@/components/CoverImage';
import type { Application } from '@/lib/queries';

function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

export default function AppCard({ app }: { app: Application }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 transition duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:shadow-[0_16px_40px_-16px_rgba(34,211,238,0.3)]">
      <Link href={`/app/${app.id}`} className="flex flex-1 flex-col">
        <CoverImage src={app.imageUrl} alt={app.name ?? `تطبيق ${app.id}`} />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h2 className="line-clamp-1 text-base font-semibold text-white">
            {app.name ?? `تطبيق ${app.id}`}
          </h2>
          <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{app.description}</p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {app.version ? <Tag className="bg-slate-800 text-slate-300">{app.version}</Tag> : null}
            {app.size ? <Tag className="bg-violet-500/10 text-violet-300">{app.size}</Tag> : null}
            {app.platform ? <Tag className="bg-cyan-500/10 text-cyan-300">{app.platform}</Tag> : null}
          </div>
          <span className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition group-hover:from-cyan-400 group-hover:to-violet-500">
            عرض وتنزيل
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </span>
        </div>
      </Link>
    </article>
  );
}
