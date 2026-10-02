import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('control');
export function GET(request: Request) { return handler(request); }
export function POST(request: Request) { return handler(request); }
const unsupported = () => adminMethodNotAllowed('control');
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
