import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { AdminError, FILE_FIELDS, choice, fields, id, invalid, key, metadata, object, revision, text, uuid } from './validation';

type Tx = TransactionSql;
type Version = { id: string; application_id: number; version_label: string; release_key: string;
  active: boolean; published: boolean; published_at: Date | null; created_at: Date };
type File = { id: string; version_id: string; variant_key: string; artifact_type: string; size_bytes: string;
  sha256: string; mime_type: string; download_filename: string; storage_backend: string; storage_key: string;
  storage_object_version: string | null; scan_status: string; verified_at: Date | null;
  active: boolean; retired_at: Date | null; created_at: Date };
type Config = { application_id: number; mode: string; current_version_id: string | null; updated_at: Date };
type Page = { limit: number; after: number | string | null; parent: number | string | null };
export type AdminOperation = 'catalog' | 'versions' | 'version' | 'files' | 'file' | 'config' | 'status' | 'control';
const missing = () => new AdminError(404, 'RECORD_NOT_FOUND');
const conflict = (code = 'STATE_CONFLICT') => new AdminError(409, code);
const hash = (row: unknown) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
function expect(row: unknown, supplied: unknown) {
  if (revision(supplied) !== hash(row)) throw conflict('STALE_REVISION');
}
const versionView = (row: Version) => ({ id: row.id, application_id: row.application_id, version_label: row.version_label,
  release_key: row.release_key, active: row.active, published: row.published, published_at: row.published_at,
  created_at: row.created_at, revision: hash(row) });
// Explicit DTO: storage key, provider version and raw content checksum never leave the service.
const fileView = (row: File) => ({ id: row.id, version_id: row.version_id, variant_key: row.variant_key,
  artifact_type: row.artifact_type, size_bytes: Number(row.size_bytes), mime_type: row.mime_type,
  download_filename: row.download_filename, storage_backend: row.storage_backend, checksum_present: /^[a-f0-9]{64}$/.test(row.sha256),
  scan_status: row.scan_status, verified_at: row.verified_at, active: row.active, retired_at: row.retired_at,
  created_at: row.created_at, revision: hash(row) });
const configView = (row: Config | undefined, applicationId: number) => ({ application_id: applicationId,
  mode: row?.mode ?? 'legacy', current_version_id: row?.current_version_id ?? null,
  updated_at: row?.updated_at ?? null, revision: hash(row ?? null) });
function pageView<T extends { id: number | string }>(rows: T[], limit: number) {
  return { items: rows.slice(0, limit), next_after: rows.length > limit ? rows[limit - 1].id : null };
}
function immutable(row: File) {
  try {
    metadata(Object.fromEntries(FILE_FIELDS.map(name => [name, name === 'size_bytes' ? Number(row[name as keyof File]) : row[name as keyof File]])), row.id);
    return row.storage_backend === 'railway-s3' || Boolean(row.storage_object_version);
  } catch { return false; }
}
function verified(row: File) {
  return row.scan_status === 'verified' && Boolean(row.verified_at) && !row.retired_at && immutable(row);
}

/** Only additive download tables are writable; catalog rows remain bot-owned.
 * No DDL, byte I/O, provider calls, signing or environment mutations. */
export class OwnerAdminService {
  constructor(private sql: Sql, private env: NodeJS.ProcessEnv = process.env) {}
  private async transaction<T>(write: boolean, callback: (tx: Tx) => Promise<T>): Promise<T> {
    const result = await this.sql.begin(write ? 'isolation level serializable' : 'isolation level repeatable read read only', async tx => {
      await tx`SET LOCAL lock_timeout='2s'`;
      await tx`SET LOCAL statement_timeout='5s'`;
      const [schema] = await tx`SELECT to_regclass('site_download_settings') AS settings,
        to_regclass('site_download_versions') AS versions,to_regclass('site_download_files') AS files,
        to_regclass('site_download_app_config') AS config,to_regclass('site_download_budget') AS budget`;
      if (!schema || Object.values(schema).some(value => !value)) throw new AdminError(503, 'ADMIN_SCHEMA_UNAVAILABLE');
      if (write) {
        // Same metadata lock as Phase 4 CLI; serializable writes plus row locks prevent lost/stale updates.
        await tx`SELECT pg_advisory_xact_lock(748031004)`;
        await tx`LOCK TABLE site_download_versions,site_download_files,site_download_app_config IN SHARE ROW EXCLUSIVE MODE`;
      }
      return callback(tx);
    });
    return result as T;
  }
  private async app(tx: Tx, applicationId: number, write: boolean) {
    const rows = write
      ? await tx`SELECT id,active,published FROM applications WHERE id=${applicationId} FOR SHARE`
      : await tx`SELECT id,active,published FROM applications WHERE id=${applicationId}`;
    if (!rows[0]) throw missing();
    return rows[0];
  }
  private async version(tx: Tx, versionId: string, write: boolean): Promise<Version> {
    const rows = write ? await tx<Version[]>`SELECT * FROM site_download_versions WHERE id=${versionId} FOR UPDATE`
      : await tx<Version[]>`SELECT * FROM site_download_versions WHERE id=${versionId}`;
    if (!rows[0]) throw missing();
    return rows[0];
  }
  private async file(tx: Tx, fileId: string, write: boolean): Promise<File> {
    const rows = write ? await tx<File[]>`SELECT * FROM site_download_files WHERE id=${fileId} FOR UPDATE`
      : await tx<File[]>`SELECT * FROM site_download_files WHERE id=${fileId}`;
    if (!rows[0]) throw missing();
    return rows[0];
  }
  async read(operation: AdminOperation, recordId?: string, page?: Page) {
    return this.transaction(false, async tx => {
      if (operation === 'catalog' && page) {
        const rows = await tx<(Record<string, unknown> & { id: number })[]>`SELECT id,name,version,size,category,platform,active,published FROM applications
          WHERE id>${page.after ?? 0} ORDER BY id LIMIT ${page.limit + 1}`;
        return pageView(rows, page.limit);
      }
      if (operation === 'versions' && page) {
        await this.app(tx, Number(page.parent), false);
        const rows = await tx<Version[]>`SELECT * FROM site_download_versions WHERE application_id=${page.parent}
          AND (${page.after}::uuid IS NULL OR id>${page.after}::uuid) ORDER BY id LIMIT ${page.limit + 1}`;
        return pageView(rows.map(versionView), page.limit);
      }
      if (operation === 'version') return versionView(await this.version(tx, uuid(recordId), false));
      if (operation === 'files' && page) {
        await this.version(tx, String(page.parent), false);
        const rows = await tx<File[]>`SELECT * FROM site_download_files WHERE version_id=${page.parent}
          AND (${page.after}::uuid IS NULL OR id>${page.after}::uuid) ORDER BY id LIMIT ${page.limit + 1}`;
        return pageView(rows.map(fileView), page.limit);
      }
      if (operation === 'file') return fileView(await this.file(tx, uuid(recordId), false));
      if (operation === 'config') {
        const applicationId = this.applicationId(recordId);
        await this.app(tx, applicationId, false);
        const [row] = await tx<Config[]>`SELECT * FROM site_download_app_config WHERE application_id=${applicationId}`;
        return configView(row, applicationId);
      }
      if (operation === 'status' || operation === 'control') {
        const [settings] = await tx`SELECT enabled,updated_at FROM site_download_settings WHERE id=1`;
        if (!settings) throw new AdminError(503, 'ADMIN_SCHEMA_UNAVAILABLE');
        const [budget] = await tx`SELECT starts_at,expires_at,allowance_verified,byte_limit::text,reserved_bytes::text,
          amplification_factor,max_outstanding,starts_at<=clock_timestamp() AND expires_at>clock_timestamp() AS current
          FROM site_download_budget WHERE id=1`;
        return { shared_enabled: settings.enabled, updated_at: settings.updated_at,
          deployment_enabled: this.env.DIRECT_DOWNLOADS_ENABLED === 'true', activation_allowed: false,
          control: 'disable_only', budget: budget ? { ...budget,
            remaining_bytes: (BigInt(budget.byte_limit) - BigInt(budget.reserved_bytes)).toString() } : null,
          budget_source: 'configured_reservation_ledger', provider_billing_available: false };
      }
      throw invalid();
    });
  }
  private applicationId(value: unknown) {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw invalid();
    return id(Number(value));
  }
  async write(operation: AdminOperation, body: Record<string, unknown>, ownerId: string, recordId?: string) {
    return this.transaction(true, async tx => {
      if (operation === 'control') {
        fields(body, ['enabled']);
        if (body.enabled !== false) throw conflict('ROLLOUT_BLOCKED');
        const rows = await tx`UPDATE site_download_settings SET enabled=false,updated_at=clock_timestamp(),updated_by=${ownerId}
          WHERE id=1 RETURNING enabled,updated_at`;
        if (!rows[0]) throw new AdminError(503, 'ADMIN_SCHEMA_UNAVAILABLE');
        return { ...rows[0], activation_allowed: false };
      }
      if (operation === 'config') {
        fields(body, ['mode', 'current_version_id', 'expected_revision']);
        const mode = choice(body.mode, ['legacy', 'direct', 'disabled']);
        if (body.current_version_id !== null) uuid(body.current_version_id);
        revision(body.expected_revision);
        // An independent deny: metadata/credentials/env flags cannot bypass rollout review.
        if (body.mode === 'direct') throw conflict('ROLLOUT_BLOCKED');
        if (body.current_version_id !== null) throw invalid();
        const applicationId = this.applicationId(recordId);
        await this.app(tx, applicationId, true);
        const [before] = await tx<Config[]>`SELECT * FROM site_download_app_config WHERE application_id=${applicationId} FOR UPDATE`;
        expect(before ?? null, body.expected_revision);
        if (before?.mode === body.mode && before.current_version_id === null) return configView(before, applicationId);
        const [row] = await tx<Config[]>`INSERT INTO site_download_app_config(application_id,mode,current_version_id)
          VALUES(${applicationId},${mode},NULL) ON CONFLICT(application_id) DO UPDATE
          SET mode=EXCLUDED.mode,current_version_id=NULL,updated_at=clock_timestamp() RETURNING *`;
        return configView(row, applicationId);
      }
      if (operation === 'versions') {
        fields(body, ['application_id', 'version_label', 'release_key']);
        const applicationId = id(body.application_id), label = text(body.version_label, 100), release = key(body.release_key);
        await this.app(tx, applicationId, true);
        const [existing] = await tx<Version[]>`SELECT * FROM site_download_versions WHERE application_id=${applicationId} AND release_key=${release} FOR UPDATE`;
        if (existing) {
          if (existing.version_label !== label) throw conflict('IDENTITY_CONFLICT');
          return versionView(existing);
        }
        const [row] = await tx<Version[]>`INSERT INTO site_download_versions(id,application_id,version_label,release_key)
          VALUES(${randomUUID()},${applicationId},${label},${release}) RETURNING *`;
        return versionView(row);
      }
      if (operation === 'version') {
        fields(body, ['expected_revision'], ['version_label', 'action']);
        if (Object.hasOwn(body, 'version_label') === Object.hasOwn(body, 'action')) throw invalid();
        const before = await this.version(tx, uuid(recordId), true);
        expect(before, body.expected_revision);
        if (Object.hasOwn(body, 'version_label')) {
          const label = text(body.version_label, 100);
          if (before.active || before.published || before.published_at) throw conflict('IMMUTABLE_METADATA');
          if (label === before.version_label) return versionView(before);
          await tx`UPDATE site_download_versions SET version_label=${label} WHERE id=${before.id}`;
        } else {
          choice(body.action, ['activate', 'publish', 'withdraw']);
          if (body.action !== 'withdraw') {
            const app = await this.app(tx, before.application_id, true);
            const files = await tx<File[]>`SELECT * FROM site_download_files WHERE version_id=${before.id} AND active=true FOR SHARE`;
            if (!files.length || files.some(file => !verified(file))) throw conflict('VERIFIED_FILES_REQUIRED');
            if (body.action === 'publish' && (!before.active || !app.active || !app.published)) throw conflict('PUBLICATION_BLOCKED');
          }
          if (body.action === 'activate') await tx`UPDATE site_download_versions SET active=true WHERE id=${before.id}`;
          else if (body.action === 'publish') await tx`UPDATE site_download_versions SET published=true,published_at=COALESCE(published_at,clock_timestamp()) WHERE id=${before.id}`;
          else await tx`UPDATE site_download_versions SET active=false,published=false WHERE id=${before.id}`;
        }
        return versionView(await this.version(tx, before.id, false));
      }
      if (operation === 'files') {
        fields(body, ['id', 'version_id', 'metadata']);
        const fileId = uuid(body.id), versionId = uuid(body.version_id), input = metadata(object(body.metadata), fileId);
        const version = await this.version(tx, versionId, true);
        const [existing] = await tx<File[]>`SELECT * FROM site_download_files WHERE id=${fileId} OR (version_id=${versionId} AND variant_key=${input.variant_key}) FOR UPDATE`;
        if (existing) {
          if (existing.id !== fileId || existing.version_id !== versionId || FILE_FIELDS.some(name =>
            String(existing[name as keyof File]) !== String(input[name as keyof typeof input]))) throw conflict('IDENTITY_CONFLICT');
          return fileView(existing);
        }
        if (version.active || version.published || version.published_at) throw conflict('IMMUTABLE_METADATA');
        const [row] = await tx<File[]>`INSERT INTO site_download_files(id,version_id,variant_key,artifact_type,size_bytes,sha256,
          mime_type,download_filename,storage_backend,storage_key,storage_object_version)
          VALUES(${fileId},${versionId},${input.variant_key},${input.artifact_type},${input.size_bytes},${input.sha256},${input.mime_type},
            ${input.download_filename},${input.storage_backend},${input.storage_key},${input.storage_object_version}) RETURNING *`;
        return fileView(row);
      }
      if (operation === 'file') {
        fields(body, ['expected_revision', 'action'], ['metadata']);
        const before = await this.file(tx, uuid(recordId), true);
        expect(before, body.expected_revision);
        if (body.action === 'edit') {
          const input = metadata(object(body.metadata), before.id);
          const version = await this.version(tx, before.version_id, true);
          if (before.scan_status !== 'pending' || before.verified_at || before.active || before.retired_at
            || version.active || version.published || version.published_at) throw conflict('IMMUTABLE_METADATA');
          if (input.variant_key !== before.variant_key) throw conflict('IDENTITY_CONFLICT');
          await tx`UPDATE site_download_files SET size_bytes=${input.size_bytes},sha256=${input.sha256},mime_type=${input.mime_type},
            download_filename=${input.download_filename},storage_backend=${input.storage_backend},storage_key=${input.storage_key},
            storage_object_version=${input.storage_object_version} WHERE id=${before.id}`;
        } else {
          choice(body.action, ['activate', 'deactivate', 'quarantine', 'retire']);
          if (Object.hasOwn(body, 'metadata')) throw invalid();
          if (body.action === 'activate') {
            if (!verified(before)) throw conflict('VERIFIED_FILES_REQUIRED');
            await tx`UPDATE site_download_files SET active=true WHERE id=${before.id}`;
          } else if (body.action === 'deactivate') await tx`UPDATE site_download_files SET active=false WHERE id=${before.id}`;
          else if (body.action === 'quarantine') await tx`UPDATE site_download_files SET active=false,scan_status='quarantined' WHERE id=${before.id}`;
          else await tx`UPDATE site_download_files SET active=false,retired_at=COALESCE(retired_at,clock_timestamp()) WHERE id=${before.id}`;
        }
        return fileView(await this.file(tx, before.id, false));
      }
      throw invalid();
    });
  }
}
