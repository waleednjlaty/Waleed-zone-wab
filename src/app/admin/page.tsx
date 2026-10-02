import AdminDashboard from '@/components/admin/AdminDashboard';
import { requireOwner } from '@/lib/authorization';

export default async function AdminPage() {
  await requireOwner();
  return <AdminDashboard />;
}
