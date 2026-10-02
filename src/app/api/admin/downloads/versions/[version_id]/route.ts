import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('version');
export async function GET(request: Request, context: { params: Promise<{ version_id: string }> }) {
  return handler(request, (await context.params).version_id);
}
export async function PATCH(request: Request, context: { params: Promise<{ version_id: string }> }) {
  return handler(request, (await context.params).version_id);
}
const unsupported = () => adminMethodNotAllowed('version');
export const POST = unsupported;
export const PUT = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
