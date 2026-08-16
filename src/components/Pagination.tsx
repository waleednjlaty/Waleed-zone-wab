import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  q?: string;
  category?: string;
}

function buildHref(page: number, q?: string, category?: string): string {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

function getPages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...wanted]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const pages: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) pages.push('ellipsis');
    pages.push(page);
    previous = page;
  }
  return pages;
}

export default function Pagination({ currentPage, totalPages, q, category }: PaginationProps) {
  if (totalPages <= 1) return null;

  const buttonClass =
    'inline-flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/40 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white';
  const disabledClass = 'cursor-not-allowed opacity-40';
  const pageClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-medium transition';

  const pages = getPages(currentPage, totalPages);

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1, q, category)} className={buttonClass}>
          السابق
        </Link>
      ) : (
        <span className={`${buttonClass} ${disabledClass}`}>السابق</span>
      )}

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-slate-500">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(page, q, category)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={`${pageClass} ${
              page === currentPage
                ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300'
                : 'border-slate-700/80 bg-slate-900/40 text-slate-300 hover:border-slate-500 hover:text-white'
            }`}
          >
            {page}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link href={buildHref(currentPage + 1, q, category)} className={buttonClass}>
          التالي
        </Link>
      ) : (
        <span className={`${buttonClass} ${disabledClass}`}>التالي</span>
      )}
    </nav>
  );
}
