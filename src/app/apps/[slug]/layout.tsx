import type { ReactNode } from 'react';
import { resolveDetail } from '@/lib/catalog/resolve';

export default async function DetailLayout({ children, params }: { children: ReactNode; params: Promise<{slug:string}> }) {
  await resolveDetail((await params).slug, 'apps');
  return children;
}
