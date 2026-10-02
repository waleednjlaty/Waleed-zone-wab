import { createDownloadHandler, downloadMethodNotAllowed } from '@/lib/downloads/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createDownloadHandler('token');
export async function POST(request: Request, context: { params: Promise<{ request_id: string }> }) {
  return handler(request, (await context.params).request_id);
}
const unsupported = (request: Request) => downloadMethodNotAllowed(request, 'POST');
export const GET = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
