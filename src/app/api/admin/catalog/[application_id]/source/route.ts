import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('delivery-source');
async function handle(request: Request, context: { params: Promise<{ application_id: string }> }) {
  return handler(request,(await context.params).application_id);
}
export const PUT = handle;
const unsupported = () => adminMethodNotAllowed('delivery-source');
export const GET = unsupported;
export const POST = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
