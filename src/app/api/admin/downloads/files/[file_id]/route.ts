import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('file');
export async function GET(request: Request, context: { params: Promise<{ file_id: string }> }) {
  return handler(request, (await context.params).file_id);
}
export async function PATCH(request: Request, context: { params: Promise<{ file_id: string }> }) {
  return handler(request, (await context.params).file_id);
}
const unsupported = () => adminMethodNotAllowed('file');
export const POST = unsupported;
export const PUT = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
