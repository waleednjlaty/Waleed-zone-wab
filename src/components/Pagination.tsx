import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  q?: string;
  category?: string;
  basePath?: string;
}

function buildHref(
  page: number,
  q?: string,
  category?: string,
  basePath = '/',
): string {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? basePath + '?' + query : basePath;
}

function getPages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const pages: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) pages.push('ellipsis');
    pages.push(page);
    previous = page;
  }
  return pages;
}

export default function Pagination({
  currentPage,
  totalPages,
  q,
  category,
  basePath = '/',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPages(currentPage, totalPages);
  const buttonClass = 'subtle-button inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold';
  const pageClass = 'inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-bold transition';

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link href={buildHref(currentPage - 1, q, category, basePath)} className={buttonClass}>السابق</Link>
      ) : (
        <span className={buttonClass + ' cursor-not-allowed opacity-35'}>السابق</span>
      )}

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={'ellipsis-' + index} aria-hidden="true" className="px-1 text-slate-600">…</span>
        ) : (
          <Link
            key={page}
            href={buildHref(page, q, category, basePath)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={pageClass + ' ' + (page === currentPage
              ? 'border-cyan-300 bg-cyan-300 text-slate-950'
              : 'border-white/[0.06] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-white')}
          >
            {page}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link href={buildHref(currentPage + 1, q, category, basePath)} className={buttonClass}>التالي</Link>
      ) : (
        <span className={buttonClass + ' cursor-not-allowed opacity-35'}>التالي</span>
      )}
    </nav>
  );
}
