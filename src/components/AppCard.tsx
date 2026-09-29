import Link from 'next/link';
import CoverImage from '@/components/CoverImage';
import type { Application } from '@/lib/queries';

export default function AppCard({ app }: { app: Application }) {
  const name = app.name || `تطبيق ${app.id}`;
  return <article className="surface card-lift group overflow-hidden">
    <Link href={`/app/${app.id}`} className="flex h-full flex-col" aria-label={`تفاصيل ${name}`}>
      <div className="relative bg-[#e4ebe7]"><CoverImage src={app.imageUrl} alt={name} aspectClassName="aspect-[16/9]" imgClassName="transition duration-500 group-hover:scale-105" />
        {app.category && <span className="absolute right-3 top-3 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold text-[#173b3b] shadow-sm">{app.category}</span>}
      </div>
      <div className="flex flex-1 flex-col p-5"><p className="text-[11px] font-bold text-[#a65b40]">{app.platform || 'تطبيق'} {app.version ? `· ${app.version}` : ''}</p>
        <h3 className="mt-2 line-clamp-2 text-lg font-black leading-7">{name}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#667577]">{app.description || 'شاهد معلومات التطبيق وخيارات التحميل.'}</p>
        <div className="mt-auto flex items-center justify-between border-t border-[#e7ece9] pt-4 text-sm font-bold"><span className="text-[#667577]">{app.size || 'عرض التفاصيل'}</span><span className="text-[#b95736]">التفاصيل ←</span></div>
      </div>
    </Link>
  </article>;
}
