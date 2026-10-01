interface PaginationProps {
  currentPage: number;
  totalPages: number;
  q?: string;
  category?: string;
  basePath?: string;
  browse?: boolean;
}

function buildHref(page: number, q?: string, category?: string, basePath = '/', browse = false): string {
  const params = new URLSearchParams();
  if (browse) params.set('browse', 'all');
  if (q?.trim()) params.set('q', q.trim());
  if (category && basePath === '/') params.set('category', category);
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

export default function Pagination({ currentPage, totalPages, q, category, basePath = '/', browse = false }: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = getPages(currentPage, totalPages);
  const buttonClass = 'secondary-action';
  const pageClass = 'inline-flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-bold transition duration-150';

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <a href={buildHref(currentPage - 1, q, category, basePath, browse)} className={buttonClass}>السابق</a>
      ) : (
        <span className={buttonClass + ' cursor-not-allowed opacity-35'}>السابق</span>
      )}

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={'ellipsis-' + index} aria-hidden="true" className="px-1 text-[#a6b5b8]">…</span>
        ) : (
          <a
            key={page}
            href={buildHref(page, q, category, basePath, browse)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={pageClass + ' ' + (page === currentPage
              ? 'border-[#d9f578] bg-[#d9f578] text-[#142029]'
              : 'border-[#30404a] bg-[#142029] text-[#a6b5b8] hover:border-[#d9f578]')}
          >
            {page}
          </a>
        ),
      )}

      {currentPage < totalPages ? (
        <a href={buildHref(currentPage + 1, q, category, basePath, browse)} className={buttonClass}>التالي</a>
      ) : (
        <span className={buttonClass + ' cursor-not-allowed opacity-35'}>التالي</span>
      )}
    </nav>
  );
}
