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
  return query ? '/?' + query : '/';
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
    <nav aria-label="تصفية حسب الفئة" className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-center gap-2 pb-1">
        {pills.map((pill) => (
          <Link
            key={pill.label}
            href={pill.href}
            aria-current={pill.isActive ? 'page' : undefined}
            className={
              'rounded-xl border px-4 py-2.5 text-sm font-bold transition ' +
              (pill.isActive
                ? 'border-cyan-300/25 bg-cyan-300 text-slate-950'
                : 'border-white/[0.06] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white')
            }
          >
            {pill.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
