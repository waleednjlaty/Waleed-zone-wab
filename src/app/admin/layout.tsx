import type { ReactNode } from 'react';
import { requireOwner } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
