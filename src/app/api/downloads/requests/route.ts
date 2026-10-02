import { createDownloadHandler, downloadMethodNotAllowed } from '@/lib/downloads/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createDownloadHandler('request');
export function POST(request: Request) { return handler(request); }
const unsupported = (request: Request) => downloadMethodNotAllowed(request, 'POST');
export const GET = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const HEAD = unsupported;
export const OPTIONS = unsupported;
