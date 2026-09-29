import Link from 'next/link';
interface Props {categories:string[];active?:string;q?:string;}
export default function CategoryPills({categories,active,q}:Props) {
 if(!categories.length)return null;
 return <nav aria-label="تصفح الفئات" className="overflow-x-auto pb-2"><div className="flex min-w-max gap-2"><Link href={q?`/?q=${encodeURIComponent(q)}`:'/'} className={`rounded-full border px-5 py-2.5 text-sm font-bold ${!active?'border-[#d9f578] bg-[#d9f578] text-[#142029]':'border-[#30404a] bg-[#142029] hover:border-[#d9f578]'}`}>الكل</Link>{categories.map(category=><Link key={category} href={q?`/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`:`/category/${encodeURIComponent(category)}`} className={`rounded-full border px-5 py-2.5 text-sm font-bold ${active===category?'border-[#d9f578] bg-[#d9f578] text-[#142029]':'border-[#30404a] bg-[#142029] hover:border-[#d9f578]'}`}>{category}</Link>)}</div></nav>;
}
