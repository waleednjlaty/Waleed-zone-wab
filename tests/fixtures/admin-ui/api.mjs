export const versionId = '11111111-1111-4111-8111-111111111111';
export const fileId = '22222222-2222-4222-8222-222222222222';
export const token = '1790960400.' + 'a'.repeat(43) + '.' + 'b'.repeat(43);
export const revision = 'c'.repeat(64);
export function fixture() {
  return {
    applications: [{ id: 201, active: true, published: true, name: 'WZ Test App', icon_url: null, mode: 'legacy', current_version_id: versionId },
      { id: 202, active: true, published: true, name: 'تطبيق جديد طويل الاسم لاختبار الواجهة', icon_url: null, mode: 'disabled', current_version_id: null }],
    detail: { application: { id: 201, active: true, published: true, name: 'WZ Test App', icon_url: null, mode: 'legacy', current_version_id: versionId, revision },
      versions: [{ id: versionId, application_id: 201, version_label: '1.0.0', release_key: '1.0.0-r1', active: false, published: false, published_at: null, revision }],
      files: [{ id: fileId, version_id: versionId, variant_key: 'universal', download_filename: 'wz-test-1.0.0.apk',
        size_bytes: 85000000, mime_type: 'application/vnd.android.package-archive', scan_status: 'verified', active: false, retired_at: null, revision,
        storage_key: 'DO_NOT_RENDER_STORAGE_KEY', sha256: 'DO_NOT_RENDER_SHA', signed_url: 'https://private.invalid/DO_NOT_RENDER_SIGNED_URL' }],
      blockers: ['DIRECT_ACTIVATION_BLOCKED'], direct_activation_allowed: false },
    status: { shared_enabled: false, updated_at: '2026-10-02T15:40:00Z', deployment_enabled: false, activation_allowed: false,
      control: 'disable_only', budget_source: 'configured_reservation_ledger', provider_billing_available: false, budget: null },
  };
}
