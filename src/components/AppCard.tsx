import Link from 'next/link';
import type { ReactNode } from 'react';
import CoverImage from '@/components/CoverImage';
import type { Application } from '@/lib/queries';

function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={'rounded-lg border px-2.5 py-1 text-[11px] font-semibold ' + className}>
      {children}
    </span>
  );
}

export default function AppCard({ app }: { app: Application }) {
  const appName = app.name ?? \`تطبيق \${app.id}\`;

  return (
    <article className="card-glow group overflow-hidden rounded-[1.35rem] bg-slate-900/70 transition duration-300 hover:-translate-y-1.5">
      <Link
        href={\`/app/\${app.id}\`}
        className="flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-slate-800/80 bg-gradient-to-b from-slate-900/80 to-slate-950/90"
      >
        <div className="relative overflow-hidden">
          <CoverImage
            src={app.imageUrl}
            alt={appName}
            aspectClassName="aspect-[16/10]"
            imgClassName="transition duration-500 ease-out group-hover:scale-[1.045]"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950 to-transparent"
          />

          {app.category ? (
            <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-950/75 px-2.5 py-1 text-[11px] font-bold text-slate-200 backdrop-blur-md">
              {app.category}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="line-clamp-1 text-base font-black text-white sm:text-[17px]">{appName}</h2>
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900 text-slate-400 transition group-hover:border-cyan-400/30 group-hover:text-cyan-300"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M8 7h9v9" />
              </svg>
            </span>
          </div>

          <p className="mt-2 line-clamp-2 min-h-[2.7rem] text-sm leading-relaxed text-slate-400">
            {app.description || 'تفاصيل وتحميل التطبيق من Waleed Zone.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {app.version ? (
              <Tag className="border-slate-700/70 bg-slate-800/70 text-slate-300">{app.version}</Tag>
            ) : null}
            {app.size ? (
              <Tag className="border-violet-400/15 bg-violet-500/10 text-violet-300">{app.size}</Tag>
            ) : null}
            {app.platform ? (
              <Tag className="border-cyan-400/15 bg-cyan-500/10 text-cyan-300">{app.platform}</Tag>
            ) : null}
          </div>

          <div className="mt-auto pt-5">
            <span className="flex items-center justify-between border-t border-slate-800/80 pt-4 text-sm font-bold text-slate-300 transition group-hover:text-cyan-200">
              <span>عرض التفاصيل والتحميل</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 rotate-180">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
