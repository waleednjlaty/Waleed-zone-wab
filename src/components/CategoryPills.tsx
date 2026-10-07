import Link from 'next/link';
import { getLocale } from '@/lib/locale-server';

interface Props { categories: string[]; active?: string; q?: string; }

export default async function CategoryPills({ categories, active, q }: Props) {
  if (!categories.length) return null;
  const english = (await getLocale()) === 'en';
  return <nav aria-label={english ? 'Browse categories' : 'تصفح الفئات'} className="category-pills">
    <Link href={q ? `/?q=${encodeURIComponent(q)}` : '/'} className={`category-pill${!active ? ' is-active' : ''}`} aria-current={!active ? 'page' : undefined}>{english ? 'All' : 'الكل'}</Link>
    {categories.map(category => <Link key={category} href={q ? `/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}` : `/category/${encodeURIComponent(category)}`} className={`category-pill${active === category ? ' is-active' : ''}`} aria-current={active === category ? 'page' : undefined}>{category}</Link>)}
  </nav>;
}
