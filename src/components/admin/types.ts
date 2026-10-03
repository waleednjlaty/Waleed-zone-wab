/** Deliberately limited presentation model. No signed URLs or provider credentials. */
export type Mode = 'legacy' | 'direct' | 'disabled';
export type ScanStatus = 'pending' | 'verified' | 'quarantined' | 'failed';
export type Section = 'overview' | 'applications' | 'configuration' | 'versions' | 'files' | 'system' | 'kill-switch' | 'monetization';
export interface AdminApp {
  id: number; name: string; icon: string | null;
  mode: Mode | null; currentVersionId: string | null;
  active: boolean; published: boolean;
}
export interface Version {
  id: string; applicationId: number; label: string; releaseKey: string;
  active: boolean; published: boolean; immutable: boolean; revision: string;
}
export interface Artifact {
  id: string; versionId: string; variantKey: string; filename: string;
  sizeBytes: number; mimeType: string; scanStatus: ScanStatus;
  active: boolean; retired: boolean; revision: string;
}
export interface AppDetail {
  app: AdminApp & { mode: Mode; configRevision: string };
  versions: Version[]; files: Artifact[]; blockers: string[]; directActivationAllowed: boolean;
}
export interface SystemStatus {
  checkedAt: string; enabled: boolean; deploymentEnabled: boolean;
  migrationReady: boolean; storageReady: boolean; ingressReady: boolean;
  activationAllowed: boolean; canaryReady: boolean; blockers: string[];
  budget: null | {
    verified: boolean; current: boolean; limitBytes: string; reservedBytes: string; remainingBytes: string;
    startsAt: string; expiresAt: string;
  };
}
export type VersionAction = 'activate' | 'publish' | 'withdraw';
export type VersionInput = { application_id: number; version_label: string; release_key: string }
  | { expected_revision: string; version_label: string }
  | { expected_revision: string; action: VersionAction };
export type FileAction = 'activate' | 'deactivate' | 'quarantine' | 'retire';
export interface FileMetadata {
  variant_key: string; artifact_type: 'apk'; size_bytes: number; sha256: string;
  mime_type: 'application/vnd.android.package-archive'; download_filename: string;
  storage_backend: 'railway-s3' | 's3'; storage_key: string; storage_object_version: string | null;
}
export interface FileInput { id: string; version_id: string; metadata: FileMetadata }
export interface ConfigInput { expected_revision: string; mode: Mode; current_version_id: string | null }
