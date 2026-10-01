import Link from 'next/link';

interface Props { categories: string[]; active?: string; q?: string; }

export default function CategoryPills({ categories, active, q }: Props) {
  if (!categories.length) return null;
  return <nav aria-label="تصفح الفئات" className="category-pills">
    <Link href={q ? `/?q=${encodeURIComponent(q)}` : '/'} className={`category-pill${!active ? ' is-active' : ''}`} aria-current={!active ? 'page' : undefined}>الكل</Link>
    {categories.map(category => <Link key={category} href={q ? `/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}` : `/category/${encodeURIComponent(category)}`} className={`category-pill${active === category ? ' is-active' : ''}`} aria-current={active === category ? 'page' : undefined}>{category}</Link>)}
  </nav>;
}
