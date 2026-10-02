import { createDownloadHandler, downloadMethodNotAllowed } from '@/lib/downloads/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createDownloadHandler('status');
export async function GET(request: Request, context: { params: Promise<{ request_id: string }> }) {
  return handler(request, (await context.params).request_id);
}
const unsupported = (request: Request) => downloadMethodNotAllowed(request, 'GET');
export const POST = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
