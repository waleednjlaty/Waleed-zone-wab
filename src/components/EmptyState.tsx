import Link from 'next/link';
import ContentState from './loading/ContentState';
import { getLocale } from '@/lib/locale-server';

export default async function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const english = (await getLocale()) === 'en';
  return <ContentState
    kind="empty"
    title={english ? (hasQuery ? 'No matching results' : 'The library is being updated') : (hasQuery ? 'ما لقينا نتيجة مطابقة' : 'المكتبة قيد التحديث')}
    description={english ? (hasQuery ? 'Try a shorter name, Arabic or English, or another category.' : 'There is no published content right now. Check back later for new additions.') : (hasQuery ? 'جرّب اسمًا أقصر، بالعربية أو الإنجليزية، أو تصنيفًا آخر.' : 'لا يوجد محتوى منشور حاليًا. عد لاحقًا للاطلاع على الإضافات.')}
    action={hasQuery ? <Link href="/" className="secondary-action">{english ? 'View library' : 'عرض المكتبة'}</Link> : undefined}
  />;
}
