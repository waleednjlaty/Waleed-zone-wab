import 'server-only';
import { authorizeOwnerRequest, requireOwner } from '@/lib/authorization';
import { getSql } from '@/lib/db';
import { downloadBody, downloadHeaders } from '@/lib/downloads/http';
import { DownloadError } from '@/lib/downloads/rules';
import { adminOrigin, adminSession, checkAdminCsrf, issueAdminCsrf } from './security';
import { OwnerAdminService, type AdminOperation } from './service';
import { AdminError, pagination } from './validation';

type Operation = AdminOperation | 'session';
type Dependencies = { service: OwnerAdminService; env: NodeJS.ProcessEnv;
  authorize: typeof authorizeOwnerRequest; owner: typeof requireOwner };
const methods: Record<Operation, string[]> = {
  session: ['GET'], catalog: ['GET'], versions: ['GET', 'POST'], version: ['GET', 'PATCH'],
  files: ['GET', 'POST'], file: ['GET', 'PATCH'], config: ['GET', 'PUT'], status: ['GET'], control: ['GET', 'POST'],
};
export function adminErrorResponse(error: unknown) {
  const pgCode = (error && typeof error === 'object' && 'code' in error) ? error.code : null;
  const e = error instanceof AdminError ? error : error instanceof DownloadError && [400, 413, 415].includes(error.status)
    ? new AdminError(error.status, error.code) : ['23505', '23503', '40001', '40P01'].includes(String(pgCode))
      ? new AdminError(409, 'STATE_CONFLICT') : ['42P01', '42703'].includes(String(pgCode))
        ? new AdminError(503, 'ADMIN_SCHEMA_UNAVAILABLE') : new AdminError(503, 'ADMIN_UNAVAILABLE');
  return Response.json({ error: { code: e.code } }, { status: e.status,
    headers: { ...downloadHeaders, ...(e.status === 503 ? { 'Retry-After': '10' } : {}) } });
}
export function adminMethodNotAllowed(operation: Operation) {
  const response = adminErrorResponse(new AdminError(405, 'METHOD_NOT_ALLOWED'));
  response.headers.set('Allow', methods[operation].join(', '));
  return response;
}
export function createAdminHandler(operation: Operation, dependencies?: Dependencies) {
  return async (request: Request, recordId?: string): Promise<Response> => {
    try {
      if (!methods[operation].includes(request.method)) return adminMethodNotAllowed(operation);
      const env = dependencies?.env ?? process.env, write = request.method !== 'GET';
      const origin = adminOrigin(request, env, write);
      // No automation/statistics bearer-token bypass. Ownership is checked on every request.
      const denied = await (dependencies?.authorize ?? authorizeOwnerRequest)(request, false);
      if (denied) throw new AdminError(denied, 'OWNER_REQUIRED');
      const owner = await (dependencies?.owner ?? requireOwner)();
      const session = adminSession(request, env);
      if (write) checkAdminCsrf(request.headers.get('x-csrf-token'), session, owner.id, origin);
      const scoped = operation === 'versions' ? 'application_id' : operation === 'files' ? 'version_id' : undefined;
      const page = !write && ['catalog', 'versions', 'files'].includes(operation) ? pagination(request, scoped) : undefined;
      if (!page && new URL(request.url).search) throw new AdminError(400, 'INVALID_REQUEST');
      if (operation === 'session') return Response.json(issueAdminCsrf(session, owner.id, origin), { headers: downloadHeaders });
      const sql = dependencies ? null : getSql();
      if (!dependencies && !sql) throw new AdminError(503, 'ADMIN_UNAVAILABLE');
      const service = dependencies?.service ?? new OwnerAdminService(sql!, env);
      const data = write ? await service.write(operation, await downloadBody(request), owner.id, recordId)
        : await service.read(operation, recordId, page);
      return Response.json(data, { headers: downloadHeaders });
    } catch (error) { return adminErrorResponse(error); }
  };
}
