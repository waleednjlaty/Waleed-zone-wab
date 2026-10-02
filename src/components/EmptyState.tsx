import Link from 'next/link';
import ContentState from './loading/ContentState';

export default function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return <ContentState
    kind="empty"
    title={hasQuery ? 'لا توجد نتائج مطابقة' : 'المكتبة قيد التحديث'}
    description={hasQuery ? 'جرّب اسمًا أقصر أو تصنيفًا آخر.' : 'لا يوجد محتوى منشور حاليًا. عد لاحقًا للاطلاع على الإضافات.'}
    action={hasQuery ? <Link href="/" className="secondary-action">عرض المكتبة</Link> : undefined}
  />;
}
