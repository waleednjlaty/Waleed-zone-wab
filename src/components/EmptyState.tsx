import Link from 'next/link';
import Icon from '@/components/Icon';

export default function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return <div className="empty-state"><Icon name="search" width={30} height={30} /><h2>{hasQuery ? 'لا توجد نتائج مطابقة' : 'المكتبة قيد التحديث'}</h2><p>{hasQuery ? 'جرّب اسمًا أقصر أو تصنيفًا آخر.' : 'لا يوجد محتوى منشور حاليًا. عد لاحقًا للاطلاع على الإضافات.'}</p>{hasQuery && <Link href="/" className="secondary-action">عرض المكتبة</Link>}</div>;
}
