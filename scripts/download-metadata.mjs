import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { manageMetadata, manageConfig, validateConfigManifest, validateDatabaseUrl, validateManifest } from './lib/download-metadata.mjs';

const HELP = `Usage: npm run metadata:downloads -- --manifest PATH [--dry-run]
       npm run metadata:downloads -- --manifest PATH --apply --expect-plan SHA256
Options: --config-only, --verify-file PATH, --allow-pending-update, --help
Default: read-only dry-run. Verified/active states require --verify-file.
Target: DOWNLOAD_METADATA_DATABASE_URL (loopback wz_metadata_test_<suffix> only).
No production DB, upload, migration, deletion, global enable, or direct rollout.
See docs/FILE_METADATA_OPERATIONS.md.`;
let sql;
try {
  const { values } = parseArgs({ options: {
    manifest: { type: 'string' }, 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' },
    'expect-plan': { type: 'string' }, 'verify-file': { type: 'string' },
    'allow-pending-update': { type: 'boolean' }, 'config-only': { type: 'boolean' }, help: { type: 'boolean' },
  }, strict: true, allowPositionals: false });
  if (values.help) console.log(HELP);
  else {
    if (!values.manifest) throw new Error('--manifest is required');
    if (values.apply && values['dry-run']) throw new Error('--apply and --dry-run are mutually exclusive');
    if (!values.apply && values['expect-plan']) throw new Error('--expect-plan requires --apply');
    if (statSync(values.manifest).size > 65536) throw new Error('Manifest exceeds 64 KiB');
    if (values['config-only'] && (values['verify-file'] || values['allow-pending-update'])) throw new Error('--config-only cannot edit or verify artifacts');
    const m = (values['config-only'] ? validateConfigManifest : validateManifest)(JSON.parse(readFileSync(values.manifest, 'utf8')));
    const url = process.env.DOWNLOAD_METADATA_DATABASE_URL;
    const database = validateDatabaseUrl(url);
    sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5, idle_timeout: 5, onnotice: () => {} });
    const result = await (values['config-only'] ? manageConfig : manageMetadata)(sql, m, {
      database, apply: Boolean(values.apply), expectPlan: values['expect-plan'],
      verifyFile: values['verify-file'], allowPendingUpdate: Boolean(values['allow-pending-update']),
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.blockers.length) process.exitCode = 2;
  }
} catch (error) {
  // Avoid exposing driver connection details, passwords, SQL or private object values.
  const message = error.code ? `Operation failed (${error.code}); transaction rolled back if started` : error.message;
  console.error(message);
  process.exitCode = 1;
} finally { if (sql) await sql.end({ timeout: 5 }); }
