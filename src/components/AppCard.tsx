import Link from 'next/link';
import { appHref } from '@/lib/catalog/routes';
import CoverImage from '@/components/CoverImage';
import Icon from '@/components/Icon';
import { appMetadata, appName } from '@/components/catalog/presentation';
import type { Application } from '@/lib/queries';

interface AppCardProps {
  app: Application;
  variant?: 'compact' | 'row' | 'featured';
  rank?: number;
}

export default function AppCard({ app, variant = 'compact', rank }: AppCardProps) {
  const name = appName(app);
  const metadata = appMetadata(app);
  const isMod = /\bmod\b|معدل[ةه]?/i.test(name);

  return <article className={`app-card app-card--${variant}`}>
    <Link href={appHref(app)} prefetch={false} className="app-card-link" aria-label={`تفاصيل ${name}`}>
      {variant === 'featured' && <div className="featured-art"><CoverImage src={app.imageUrl} priority={rank===1} alt="" aspectClassName="aspect-[16/8]" imgClassName="featured-art-image" /></div>}
      <div className="app-card-body">
        {rank && <span className="app-rank" aria-label={`الترتيب ${rank}`}>{String(rank).padStart(2, '0')}</span>}
        <span className="app-icon"><CoverImage src={app.imageUrl} priority={rank===1} alt="" aspectClassName="aspect-square" /></span>
        <div className="app-card-copy">
          <div className="app-name-line"><h3 dir="auto">{name}</h3>{isMod && <span className="app-badge" lang="en">MOD</span>}</div>
          <p className="app-category" dir="auto">{app.category || 'المكتبة'}</p>
          {metadata && <p className="app-metadata" dir="auto">{metadata}</p>}
        </div>
        <Icon name="chevron" className="card-chevron" width={16} height={16} />
      </div>
    </Link>
  </article>;
}
