import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createAdminHandler('catalog-suggestions');
export function POST(request: Request) { return handler(request); }
const unsupported = () => adminMethodNotAllowed('catalog-suggestions');
export const GET = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
