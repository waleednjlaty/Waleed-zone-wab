import Link from 'next/link';
import CoverImage from '@/components/CoverImage';
import type { Application } from '@/lib/queries';
export default function AppCard({app}:{app:Application}) {
 const name=app.name||`تطبيق ${app.id}`;
 return <article className="surface card-lift group overflow-hidden"><Link href={`/app/${app.id}`} className="flex h-full flex-col" aria-label={`تفاصيل ${name}`}>
  <div className="relative overflow-hidden bg-[#25353d]"><CoverImage src={app.imageUrl} alt={name} aspectClassName="aspect-[16/9]" imgClassName="transition duration-500 group-hover:scale-105"/>{app.category&&<span className="absolute right-3 top-3 rounded-full border border-white/20 bg-[#0b1218]/85 px-3 py-1 text-xs font-bold text-white backdrop-blur">{app.category}</span>}</div>
  <div className="flex flex-1 flex-col p-5"><p className="text-xs font-bold text-[#d9f578]">{app.platform||'تطبيق'}{app.version?` · ${app.version}`:''}</p><h3 className="mt-2 line-clamp-2 text-lg font-black leading-7 text-white">{name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#a6b5b8]">{app.description||'شاهد تفاصيل هذا العنصر وخيارات التحميل.'}</p><div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4 text-sm"><span className="text-[#a6b5b8]">{app.size||'تفاصيل الملف'}</span><span className="font-bold text-[#d9f578]">اكتشف ←</span></div></div>
 </Link></article>;
}
