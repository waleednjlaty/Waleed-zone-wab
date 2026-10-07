import Link from 'next/link';
import Icon, { type IconName } from '@/components/Icon';
import { getLocale } from '@/lib/locale-server';

export default async function SectionHeading({ id, title, subtitle, href, icon, linkLabel, nativeNavigation = false }: { id: string; title: string; subtitle?: string; href?: string; icon?: IconName; linkLabel?: string; nativeNavigation?: boolean }) {
  const english = (await getLocale()) === 'en';
  const resolvedLinkLabel = linkLabel || (english ? 'View all' : 'عرض الكل');
  return <div className="section-heading">
    <div><h2 id={id}>{icon && <Icon name={icon} />} {title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {href && (nativeNavigation ? <a className="view-all" href={href} aria-label={`${resolvedLinkLabel}: ${title}`}>{resolvedLinkLabel} <Icon name="chevron" width={16} height={16} /></a> : <Link className="view-all" href={href} aria-label={`${resolvedLinkLabel}: ${title}`}>{resolvedLinkLabel} <Icon name="chevron" width={16} height={16} /></Link>)}
  </div>;
}
