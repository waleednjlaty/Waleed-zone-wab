import Link from 'next/link';

interface CategoryPillsProps {
  categories: string[];
  active?: string;
  q?: string;
}

function buildHref(category: string | undefined, q?: string): string {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export default function CategoryPills({ categories, active, q }: CategoryPillsProps) {
  const pills = [
    { label: 'الكل', href: buildHref(undefined, q), isActive: !active },
    ...categories.map((category) => ({
      label: category,
      href: buildHref(category, q),
      isActive: active === category,
    })),
  ];

  if (pills.length <= 1) return null;

  return (
    <nav aria-label="تصفية حسب الفئة" className="flex flex-wrap items-center justify-center gap-2">
      {pills.map((pill) => (
        <Link
          key={pill.label}
          href={pill.href}
          aria-current={pill.isActive ? 'page' : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            pill.isActive
              ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300'
              : 'border-slate-700/80 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:text-white'
          }`}
        >
          {pill.label}
        </Link>
      ))}
    </nav>
  );
}
