import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

const MIME = 'application/vnd.android.package-archive';
const MAX_SIZE = 2147483648;
const FILE_FIELDS = ['variant_key', 'artifact_type', 'size_bytes', 'sha256', 'mime_type',
  'download_filename', 'storage_backend', 'storage_key', 'storage_object_version'];
const FIELDS = ['schema_version', 'application_id', 'version_label', 'release_key', ...FILE_FIELDS,
  'file_state', 'version_state', 'config_mode', 'verification'];
function fail(message) { throw new Error(message); }
function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail(`Unknown ${label} field: ${key}`);
}
function text(value, label, max, pattern) {
  if (typeof value !== 'string' || !value.length || value.length > max || value.trim() !== value
    || /[\p{Cc}\p{Cf}]/u.test(value) || (pattern && !pattern.test(value))) fail(`Invalid ${label}`);
}
export function validateManifest(input) {
  object(input, FIELDS, 'manifest');
  if (input.schema_version !== 1) fail('schema_version must be 1');
  if (!Number.isSafeInteger(input.application_id) || input.application_id < 1 || input.application_id > 2147483647) fail('Invalid application_id');
  text(input.version_label, 'version_label', 100);
  for (const key of ['release_key', 'variant_key', 'storage_backend']) text(input[key], key, 100, /^[a-z0-9][a-z0-9._-]*$/);
  if (input.artifact_type !== 'apk' || input.mime_type !== MIME) fail('Only APK artifacts with the exact APK MIME type are supported');
  if (!Number.isSafeInteger(input.size_bytes) || input.size_bytes < 1 || input.size_bytes > MAX_SIZE) fail('size_bytes must be an integer from 1 to 2147483648');
  text(input.sha256, 'sha256', 64, /^[a-f0-9]{64}$/);
  text(input.download_filename, 'download_filename', 180, /^[^/\\]+\.apk$/);
  if (input.download_filename === '.apk' || input.download_filename.startsWith('.')) fail('Invalid download_filename');
  if (/[";%]/.test(input.download_filename)) fail('Invalid attachment download_filename');
  text(input.storage_key, 'storage_key', 512, /^[a-zA-Z0-9][a-zA-Z0-9/._-]*$/);
  if (input.storage_key.split('/').some(x => !x || x === '.' || x === '..')) fail('storage_key must be a relative object key without traversal, URLs, query strings or empty segments');
  if (input.storage_object_version !== null) text(input.storage_object_version, 'storage_object_version', 200);
  if (['railway-s3', 's3'].includes(input.storage_backend)
    && !new RegExp(`^artifacts/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/${input.sha256}\\.apk$`).test(input.storage_key)) {
    fail('S3 artifacts require a canonical content-addressed key matching SHA-256');
  }
  if (input.storage_backend === 'railway-s3' && input.storage_object_version !== null) fail('Railway does not support object versions');
  const m = { ...input, file_state: input.file_state ?? 'pending', version_state: input.version_state ?? 'pending' };
  if (!['pending', 'verified', 'active'].includes(m.file_state)) fail('Invalid file_state');
  if (!['pending', 'active', 'published'].includes(m.version_state)) fail('Invalid version_state');
  if (m.config_mode !== undefined && !['legacy', 'direct', 'disabled'].includes(m.config_mode)) fail('Invalid config_mode');
  if (m.file_state !== 'pending') {
    if (!m.storage_object_version && m.storage_backend !== 'railway-s3') fail('Verified files require an immutable storage_object_version');
    object(m.verification, ['scanner', 'scan_reference', 'scanned_sha256', 'immutable_key'], 'verification');
    if (m.storage_backend === 'railway-s3' && m.verification.immutable_key !== true) fail('Railway verification requires an explicit immutable_key publishing assertion');
    if (m.verification.immutable_key !== undefined && m.verification.immutable_key !== true) fail('immutable_key must be true when supplied');
    text(m.verification.scanner, 'scanner', 100);
    text(m.verification.scan_reference, 'scan_reference', 200);
    if (m.verification.scanned_sha256 !== m.sha256) fail('Scan evidence must bind to the manifest SHA-256');
  } else if (m.verification !== undefined) fail('Pending files cannot carry verification evidence');
  if (m.version_state !== 'pending' && m.file_state !== 'active') fail('Active/published versions require an active verified file');
  if (m.config_mode === 'direct' && m.version_state !== 'published') fail('Direct config requires a published version');
  return m;
}

// Never accepts DATABASE_URL or remotely hosted databases in this Phase 4 tool.
export function validateDatabaseUrl(value) {
  let u;
  try { u = new URL(value); } catch { fail('DOWNLOAD_METADATA_DATABASE_URL must be an explicit disposable PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !['127.0.0.1', '[::1]'].includes(u.hostname)
    || u.search || u.hash || !/^\/wz_metadata_test_[a-z0-9_]+$/.test(u.pathname)) {
    fail('Only loopback PostgreSQL databases named wz_metadata_test_<suffix> are allowed; URL overrides are prohibited');
  }
  return decodeURIComponent(u.pathname.slice(1));
}

export async function verifyLocalArtifact(m, path) {
  if (m.file_state === 'pending') return;
  if (!path) fail('--verify-file is required for verified/active files, including re-runs');
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    size += chunk.length;
    if (size > m.size_bytes) fail('Local artifact size does not match manifest');
    hash.update(chunk);
  }
  if (size !== m.size_bytes || hash.digest('hex') !== m.sha256) fail('Local artifact size/SHA-256 does not match manifest');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fileView(row) {
  if (!row) return null;
  return Object.fromEntries(['id', 'version_id', ...FILE_FIELDS, 'scan_status', 'verified_at', 'active', 'retired_at']
    .map(key => [key, key === 'size_bytes' ? Number(row[key]) : row[key]]));
}
const versionView = row => row ? Object.fromEntries(['id', 'application_id', 'version_label', 'release_key', 'active', 'published', 'published_at'].map(k => [k, row[k]])) : null;
// A Railway object has no provider version. The publisher must never overwrite this
// exact key; local verification/scan assertions alone do not certify provider bytes.
const immutableFile = f => f.storage_backend === 'railway-s3'
  ? f.storage_object_version === null && f.storage_key === `artifacts/${f.id}/${f.sha256}.apk`
  : Boolean(f.storage_object_version);
const rolloutBlocker = 'Direct activation is intentionally blocked by the Phase 4 metadata CLI; a separately reviewed rollout is required';

export async function planMetadata(tx, m, { allowPendingUpdate = false, database } = {}) {
  const [app] = await tx`SELECT id,active,published FROM applications WHERE id=${m.application_id}`;
  if (!app) fail('Application does not exist; this CLI never creates or edits legacy applications');
  const [version] = await tx`SELECT * FROM site_download_versions WHERE application_id=${m.application_id} AND release_key=${m.release_key}`;
  const [file] = version ? await tx`SELECT * FROM site_download_files WHERE version_id=${version.id} AND variant_key=${m.variant_key}` : [];
  const [config] = await tx`SELECT application_id,mode,current_version_id FROM site_download_app_config WHERE application_id=${m.application_id}`;
  if (file?.retired_at || (file && !['pending', 'verified'].includes(file.scan_status))) fail('Retired/quarantined/failed files cannot be revived; create a new release/variant/object key');
  if (!file && m.file_state !== 'pending') fail('New files must start pending; verify and activate in separate reviewed operations');
  if (file?.scan_status === 'pending' && m.file_state === 'active') fail('Files must pass through verified before activation');
  if ((!version || !version.active) && m.version_state === 'published') fail('Versions must pass through active before publication');
  const metadataChanged = file && FILE_FIELDS.some(k => fileView(file)[k] !== m[k]);
  if (metadataChanged && m.file_state !== 'pending') fail('Edit pending metadata in a separate operation before verification');
  if (metadataChanged && (file.scan_status !== 'pending' || file.active || version.active || version.published || !allowPendingUpdate)) {
    fail('Artifact metadata is immutable after verification/activation; pending edits require --allow-pending-update on an unpublished inactive version');
  }
  if (version && version.version_label !== m.version_label && (version.active || version.published || !allowPendingUpdate)) fail('Version label edits require --allow-pending-update on an unpublished inactive version');
  const rank = { pending: 0, verified: 1, active: 2 };
  if (file && rank[m.file_state] < (file.active ? 2 : file.scan_status === 'verified' ? 1 : 0)) fail('File state downgrade is prohibited; disable app config instead');
  if (version && (Number(m.version_state !== 'pending') < Number(version.active) || Number(m.version_state === 'published') < Number(version.published))) fail('Version state downgrade is prohibited; disable app config instead');
  if (m.version_state === 'published' && (!app.active || !app.published)) fail('Publishing requires an active published application');
  if (m.version_state === 'published') {
    const siblings = await tx`SELECT id,sha256,storage_backend,storage_key,scan_status,verified_at,storage_object_version,retired_at FROM site_download_files
      WHERE version_id=${version.id} AND active=true AND variant_key<>${m.variant_key}`;
    if (siblings.some(f => f.scan_status !== 'verified' || !f.verified_at || !immutableFile(f) || f.retired_at)) fail('Publication requires all active variants to be verified immutable objects');
  }
  const collisions = await tx`SELECT id FROM site_download_files WHERE storage_backend=${m.storage_backend} AND storage_key=${m.storage_key}`;
  if (collisions.some(row => row.id !== file?.id)) fail('Storage object key already belongs to another artifact');
  // New IDs are stable for plan review, while existing identities are preserved.
  const idFor = kind => {
    const h = createHash('sha256').update(JSON.stringify(['wz-metadata-v1', kind, m.application_id, m.release_key, kind === 'file' ? m.variant_key : null])).digest('hex');
    return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
  };
  const versionId = version?.id ?? idFor('version');
  const targetVersion = { id: versionId, application_id: m.application_id, version_label: m.version_label,
    release_key: m.release_key, active: m.version_state !== 'pending', published: m.version_state === 'published',
    published_at: version?.published_at ?? (m.version_state === 'published' ? 'ON_COMMIT' : null) };
  const targetFile = { id: file?.id ?? idFor('file'), version_id: versionId, ...Object.fromEntries(FILE_FIELDS.map(k => [k, m[k]])),
    scan_status: m.file_state === 'pending' ? 'pending' : 'verified',
    verified_at: file?.verified_at ?? (m.file_state !== 'pending' ? 'ON_COMMIT' : null), active: m.file_state === 'active', retired_at: null };
  if (['railway-s3', 's3'].includes(m.storage_backend)
    && m.storage_key !== `artifacts/${targetFile.id}/${m.sha256}.apk`) fail('S3 storage key must bind the exact planned file UUID and SHA-256');
  const targetConfig = m.config_mode === undefined
    ? config ?? { application_id: m.application_id, mode: 'legacy', current_version_id: null }
    : { application_id: m.application_id, mode: m.config_mode, current_version_id: m.config_mode === 'direct' ? versionId : config?.current_version_id ?? null };
  const blockers = [];
  if (m.config_mode === 'direct') {
    // Adapter registration is now conditional. This independent deny cannot be
    // lifted by credentials, deployment flags, manifests or database settings.
    blockers.push(rolloutBlocker);
    const [settings] = await tx`SELECT enabled FROM site_download_settings WHERE id=1`;
    const [budget] = await tx`SELECT allowance_verified,byte_limit,reserved_bytes,amplification_factor,
      starts_at<=clock_timestamp() AND expires_at>clock_timestamp() AS current FROM site_download_budget WHERE id=1`;
    if (!settings?.enabled) blockers.push('Shared download settings are disabled');
    if (!budget?.allowance_verified || !budget.current || BigInt(budget.byte_limit) - BigInt(budget.reserved_bytes) < BigInt(m.size_bytes) * BigInt(budget.amplification_factor)) blockers.push('Owner-verified current delivery budget is missing or insufficient');
    blockers.push('Provider/ingress/private-origin/Range/expiry/mobile gates require a separately reviewed rollout');
  }
  const plan = { schema_version: 1, database, application: app, allow_pending_update: allowPendingUpdate,
    verification: m.verification ?? null,
    version: { before: versionView(version), after: targetVersion },
    file: { before: fileView(file), after: targetFile },
    config: { before: config ?? null, after: targetConfig }, blockers };
  plan.changes = ['version', 'file', 'config'].filter(k => !same(plan[k].before, plan[k].after));
  return { ...plan, plan_sha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}

export async function manageMetadata(sql, input, options = {}) {
  const m = validateManifest(input);
  await verifyLocalArtifact(m, options.verifyFile);
  if (options.apply && !/^[a-f0-9]{64}$/.test(options.expectPlan ?? '')) fail('--apply requires --expect-plan <dry-run plan_sha256>');
  return sql.begin(options.apply ? 'isolation level serializable' : 'isolation level repeatable read read only', async tx => {
    await tx`SET LOCAL lock_timeout='5s'`;
    await tx`SET LOCAL statement_timeout='15s'`;
    const [{ database }] = await tx`SELECT current_database() AS database`;
    if (database !== options.database) fail('Connected database does not match the explicitly validated disposable target');
    if (options.apply) {
      await tx`SELECT pg_advisory_xact_lock(748031004)`;
      await tx`LOCK TABLE site_download_versions,site_download_files,site_download_app_config IN SHARE ROW EXCLUSIVE MODE`;
      await tx`SELECT id FROM applications WHERE id=${m.application_id} FOR SHARE`;
      await tx`SELECT id FROM site_download_versions WHERE application_id=${m.application_id} FOR UPDATE`;
      await tx`SELECT f.id FROM site_download_files f JOIN site_download_versions v ON f.version_id=v.id WHERE v.application_id=${m.application_id} FOR UPDATE OF f`;
    }
    const plan = await planMetadata(tx, m, { ...options, database });
    if (!options.apply) return { ...plan, applied: false };
    if (plan.blockers.length) fail(`Direct mode blocked: ${plan.blockers.join('; ')}`);
    if (plan.plan_sha256 !== options.expectPlan) fail('Plan changed; run dry-run again and review the new plan_sha256');
    if (plan.changes.includes('version')) {
      const v = plan.version.after;
      if (!plan.version.before) await tx`INSERT INTO site_download_versions(id,application_id,version_label,release_key,active,published,published_at)
        VALUES(${v.id},${v.application_id},${v.version_label},${v.release_key},${v.active},${v.published},CASE WHEN ${v.published} THEN clock_timestamp() ELSE NULL END)`;
      else await tx`UPDATE site_download_versions SET version_label=${v.version_label},active=${v.active},published=${v.published},
        published_at=CASE WHEN ${v.published} THEN COALESCE(published_at,clock_timestamp()) ELSE published_at END WHERE id=${v.id}`;
    }
    if (plan.changes.includes('file')) {
      const f = plan.file.after;
      if (!plan.file.before) await tx`INSERT INTO site_download_files(id,version_id,variant_key,artifact_type,size_bytes,sha256,mime_type,download_filename,
        storage_backend,storage_key,storage_object_version,scan_status,verified_at,active)
        VALUES(${f.id},${f.version_id},${f.variant_key},${f.artifact_type},${f.size_bytes},${f.sha256},${f.mime_type},${f.download_filename},
          ${f.storage_backend},${f.storage_key},${f.storage_object_version},${f.scan_status},CASE WHEN ${f.scan_status}='verified' THEN clock_timestamp() ELSE NULL END,${f.active})`;
      else await tx`UPDATE site_download_files SET size_bytes=${f.size_bytes},sha256=${f.sha256},mime_type=${f.mime_type},download_filename=${f.download_filename},
        storage_backend=${f.storage_backend},storage_key=${f.storage_key},storage_object_version=${f.storage_object_version},scan_status=${f.scan_status},
        verified_at=CASE WHEN ${f.scan_status}='verified' THEN COALESCE(verified_at,clock_timestamp()) ELSE verified_at END,active=${f.active} WHERE id=${f.id}`;
    }
    if (plan.changes.includes('config')) {
      const c = plan.config.after;
      await tx`INSERT INTO site_download_app_config(application_id,mode,current_version_id) VALUES(${c.application_id},${c.mode},${c.current_version_id})
        ON CONFLICT(application_id) DO UPDATE SET mode=EXCLUDED.mode,current_version_id=EXCLUDED.current_version_id,updated_at=clock_timestamp()`;
    }
    return { ...plan, applied: true, operation_id: randomUUID() };
  });
}

export function validateConfigManifest(input) {
  object(input, ['schema_version', 'application_id', 'config_mode', 'release_key'], 'config manifest');
  if (input.schema_version !== 1) fail('schema_version must be 1');
  if (!Number.isSafeInteger(input.application_id) || input.application_id < 1 || input.application_id > 2147483647) fail('Invalid application_id');
  if (!['legacy', 'direct', 'disabled'].includes(input.config_mode)) fail('Invalid config_mode');
  if (input.config_mode === 'direct') text(input.release_key, 'release_key', 100, /^[a-z0-9][a-z0-9._-]*$/);
  else if (input.release_key !== undefined) fail('Only direct config may select a release_key');
  return { ...input };
}

/** Config-only controls must work even when an artifact is quarantined or retired. */
export async function manageConfig(sql, input, options = {}) {
  const m = validateConfigManifest(input);
  if (options.apply && !/^[a-f0-9]{64}$/.test(options.expectPlan ?? '')) fail('--apply requires --expect-plan <dry-run plan_sha256>');
  return sql.begin(options.apply ? 'isolation level serializable' : 'isolation level repeatable read read only', async tx => {
    await tx`SET LOCAL lock_timeout='5s'`;
    await tx`SET LOCAL statement_timeout='15s'`;
    const [{ database }] = await tx`SELECT current_database() AS database`;
    if (database !== options.database) fail('Connected database does not match the explicitly validated disposable target');
    if (options.apply) {
      await tx`SELECT pg_advisory_xact_lock(748031004)`;
      await tx`LOCK TABLE site_download_versions,site_download_files,site_download_app_config IN SHARE ROW EXCLUSIVE MODE`;
      await tx`SELECT id FROM applications WHERE id=${m.application_id} FOR SHARE`;
    }
    const [app] = await tx`SELECT id,active,published FROM applications WHERE id=${m.application_id}`;
    if (!app) fail('Application does not exist');
    const [before] = await tx`SELECT application_id,mode,current_version_id FROM site_download_app_config WHERE application_id=${m.application_id}`;
    const blockers = [];
    let selection = null, files = [];
    if (m.config_mode === 'direct') {
      [selection] = await tx`SELECT id,active,published FROM site_download_versions WHERE application_id=${m.application_id} AND release_key=${m.release_key}`;
      if (selection) files = await tx`SELECT id,sha256,storage_backend,storage_key,scan_status,verified_at,storage_object_version,retired_at FROM site_download_files WHERE version_id=${selection.id} AND active=true ORDER BY id`;
      if (!app.active || !app.published || !selection?.active || !selection.published || !files.length
        || files.some(f => f.scan_status !== 'verified' || !f.verified_at || !immutableFile(f) || f.retired_at)) blockers.push('Direct mode requires active/published app/version and verified immutable active artifacts');
      blockers.push(rolloutBlocker,
        'Shared settings, verified budget, provider/ingress/private-origin/Range/expiry/mobile gates require a separately reviewed rollout');
    }
    const after = { application_id: m.application_id, mode: m.config_mode,
      current_version_id: m.config_mode === 'direct' ? selection?.id ?? null : before?.current_version_id ?? null };
    const plan = { schema_version: 1, operation: 'config', database, application: app, selection: selection ?? null, files,
      config: { before: before ?? null, after }, blockers, changes: same(before ?? null, after) ? [] : ['config'] };
    const plan_sha256 = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    if (!options.apply) return { ...plan, plan_sha256, applied: false };
    if (blockers.length) fail(`Direct mode blocked: ${blockers.join('; ')}`);
    if (plan_sha256 !== options.expectPlan) fail('Plan changed; run dry-run again and review the new plan_sha256');
    if (plan.changes.length) await tx`INSERT INTO site_download_app_config(application_id,mode,current_version_id)
      VALUES(${after.application_id},${after.mode},${after.current_version_id}) ON CONFLICT(application_id) DO UPDATE
      SET mode=EXCLUDED.mode,current_version_id=EXCLUDED.current_version_id,updated_at=clock_timestamp()`;
    return { ...plan, plan_sha256, applied: true, operation_id: randomUUID() };
  });
}
