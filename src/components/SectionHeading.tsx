import Link from 'next/link';
import Icon, { type IconName } from '@/components/Icon';

export default function SectionHeading({ id, title, subtitle, href, icon, linkLabel = 'عرض الكل', nativeNavigation = false }: { id: string; title: string; subtitle?: string; href?: string; icon?: IconName; linkLabel?: string; nativeNavigation?: boolean }) {
  return <div className="section-heading">
    <div><h2 id={id}>{icon && <Icon name={icon} />} {title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {href && (nativeNavigation ? <a className="view-all" href={href} aria-label={`${linkLabel}: ${title}`}>{linkLabel} <Icon name="chevron" width={16} height={16} /></a> : <Link className="view-all" href={href} aria-label={`${linkLabel}: ${title}`}>{linkLabel} <Icon name="chevron" width={16} height={16} /></Link>)}
  </div>;
}
