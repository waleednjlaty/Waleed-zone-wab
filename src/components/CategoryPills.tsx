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
    <nav
      aria-label="تصفية حسب الفئة"
      className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max items-center justify-start gap-2 px-0.5 sm:justify-center">
        {pills.map((pill) => (
          <Link
            key={pill.label}
            href={pill.href}
            aria-current={pill.isActive ? 'page' : undefined}
            className={
              'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ' +
              (pill.isActive
                ? 'border-sky-300/40 bg-sky-300/10 text-sky-100 shadow-[0_8px_24px_-16px_rgba(56,189,248,0.85)]'
                : 'border-slate-700/70 bg-slate-900/50 text-slate-400 hover:border-slate-500 hover:bg-slate-800/70 hover:text-white')
            }
          >
            {pill.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
