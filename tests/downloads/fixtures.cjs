'use strict';
const { createHash } = require('node:crypto');
const ids = { app: 201, version: '11111111-1111-4111-8111-111111111111', file: '22222222-2222-4222-8222-222222222222', otherVersion: '44444444-4444-4444-8444-444444444444', otherFile: '55555555-5555-4555-8555-555555555555' };
const bytes = Buffer.from('Waleed Zone: tiny inert QA artifact, not an APK.\n');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const storageKey = `artifacts/${ids.file}/${sha256}.apk`;
const deliveryUrl = `https://delivery.example.test/${storageKey}?X-Amz-Signature=QA_SIGNATURE_SENTINEL`;
const secrets = ['QA_PRIVATE_EMAIL@example.test', 'QA_DATABASE_PASSWORD', 'QA_SIGNING_SECRET', 'QA_SQL_STACK', 'QA_SIGNATURE_SENTINEL'];
function fixtureData() {
    return {
        application: { id: ids.app, name: 'QA application', active: true, published: true },
        config: { application_id: ids.app, mode: 'direct', current_version_id: ids.version },
        versions: [{ id: ids.version, application_id: ids.app, version_label: '1.0', active: true, published: true }, { id: ids.otherVersion, application_id: 202, version_label: '2.0', active: true, published: true }],
        files: [{ id: ids.file, version_id: ids.version, active: true, scan_status: 'verified', verified_at: '2026-10-02T00:00:00Z', size_bytes: bytes.length, sha256, artifact_type: 'apk', mime_type: 'application/vnd.android.package-archive', download_filename: 'qa.apk', storage_backend: 'qa', storage_key: storageKey, storage_object_version: 'qa-v1' },
            { id: ids.otherFile, version_id: ids.version, active: true, scan_status: 'verified', verified_at: '2026-10-02T00:00:00Z', size_bytes: bytes.length, sha256, artifact_type: 'apk', mime_type: 'application/vnd.android.package-archive', download_filename: 'qa-other.apk', storage_backend: 'qa', storage_key: 'artifacts/other/qa.apk', storage_object_version: 'qa-v1' }],
        settings: { enabled: true, deployment_enabled: true },
        storage: { bytes, metadata: { sizeBytes: BigInt(bytes.length), contentType: 'application/vnd.android.package-archive', objectVersion: 'qa-v1', sha256 }, grant: { url: deliveryUrl, expiresInSeconds: 300 } },
        privateSentinels: secrets,
    };
}
module.exports = { ids, bytes, sha256, storageKey, deliveryUrl, secrets, fixtureData };
