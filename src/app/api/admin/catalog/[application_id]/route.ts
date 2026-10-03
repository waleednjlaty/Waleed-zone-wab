import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('catalog-record');
async function handle(request: Request, context: { params: Promise<{ application_id: string }> }) {
  return handler(request,(await context.params).application_id);
}
export const PATCH = handle;
export const GET = handle;
const unsupported = () => adminMethodNotAllowed('catalog-record');
export const POST = unsupported;
export const PUT = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
