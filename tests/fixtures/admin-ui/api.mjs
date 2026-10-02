export const versionId = '11111111-1111-4111-8111-111111111111';
export const fileId = '22222222-2222-4222-8222-222222222222';
export const token = 'a'.repeat(43);
export function fixture() {
  return {
    applications: [{ application_id: 201, name: 'WZ Test App', icon_url: null, mode: 'legacy', current_version_id: versionId },
      { application_id: 202, name: 'تطبيق جديد طويل الاسم لاختبار الواجهة', icon_url: null, mode: 'disabled', current_version_id: null }],
    detail: { application: { application_id: 201, name: 'WZ Test App', icon_url: null, mode: 'legacy', current_version_id: versionId },
      versions: [{ id: versionId, application_id: 201, version_label: '1.0.0', release_key: '1.0.0-r1', active: true, published: true }],
      files: [{ id: fileId, version_id: versionId, variant_key: 'universal', download_filename: 'wz-test-1.0.0.apk',
        size_bytes: 85000000, mime_type: 'application/vnd.android.package-archive', scan_status: 'verified', active: true, retired_at: null,
        storage_key: 'DO_NOT_RENDER_STORAGE_KEY', sha256: 'DO_NOT_RENDER_SHA', signed_url: 'https://private.invalid/DO_NOT_RENDER_SIGNED_URL' }],
      blockers: ['DIRECT_ACTIVATION_BLOCKED'], direct_activation_allowed: false },
    status: { checked_at: '2026-10-02T15:40:00Z', enabled: false, deployment_enabled: false, migration_ready: true,
      storage_ready: false, ingress_ready: false, blockers: ['DEPLOYMENT_DISABLED', 'STORAGE_UNAVAILABLE', 'BUDGET_UNVERIFIED'], budget: null },
  };
}
