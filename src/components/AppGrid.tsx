import AppCard from '@/components/AppCard';
import type { Application } from '@/lib/queries';

export default function AppGrid({ apps }: { apps: Application[] }) {
  return <div className="app-grid">{apps.map(app => <AppCard key={app.id} app={app} />)}</div>;
}
