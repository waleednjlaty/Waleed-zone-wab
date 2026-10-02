import { createAdminHandler, adminMethodNotAllowed } from '@/lib/admin/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createAdminHandler('config');
export async function GET(request: Request, context: { params: Promise<{ application_id: string }> }) {
  return handler(request, (await context.params).application_id);
}
export async function PUT(request: Request, context: { params: Promise<{ application_id: string }> }) {
  return handler(request, (await context.params).application_id);
}
const unsupported = () => adminMethodNotAllowed('config');
export const POST = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
