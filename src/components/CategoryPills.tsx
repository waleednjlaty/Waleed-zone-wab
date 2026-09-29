import Link from 'next/link';
interface Props { categories: string[]; active?: string; q?: string; }
export default function CategoryPills({ categories, active, q }: Props) {
  if (!categories.length) return null;
  return <nav aria-label="تصفح الفئات" className="overflow-x-auto pb-2"><div className="flex min-w-max gap-2">
    <Link href={q ? `/?q=${encodeURIComponent(q)}` : '/'} className={`rounded-full px-5 py-2.5 text-sm font-bold ${!active ? 'bg-[#173b3b] text-white' : 'border border-[#dce3df] bg-white'}`}>الكل</Link>
    {categories.map(category => <Link key={category} href={q ? `/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}` : `/category/${encodeURIComponent(category)}`} className={`rounded-full px-5 py-2.5 text-sm font-bold ${active === category ? 'bg-[#173b3b] text-white' : 'border border-[#dce3df] bg-white hover:border-[#e36b42]'}`}>{category}</Link>)}
  </div></nav>;
}
