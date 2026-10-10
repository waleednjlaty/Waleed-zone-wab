import { createOwnerCdnHandler } from '@/lib/admin/owner-cdn-http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = createOwnerCdnHandler();
export const POST = createOwnerCdnHandler();
export const PUT = createOwnerCdnHandler();
export const DELETE = createOwnerCdnHandler();
