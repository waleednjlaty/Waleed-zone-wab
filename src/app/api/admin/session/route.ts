import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('session');
export function GET(request: Request) { return handler(request); }
const unsupported = () => adminMethodNotAllowed('session');
export const POST = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
