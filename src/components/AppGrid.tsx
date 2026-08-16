import AppCard from '@/components/AppCard';
import type { Application } from '@/lib/queries';

export default function AppGrid({ apps }: { apps: Application[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {apps.map((app) => (
        <AppCard key={app.id} app={app} />
      ))}
    </div>
  );
}
