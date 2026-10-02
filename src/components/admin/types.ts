/** Deliberately limited presentation model. No signed URLs or provider credentials. */
export type Mode = 'legacy' | 'direct' | 'disabled';
export type ScanStatus = 'pending' | 'verified' | 'quarantined' | 'failed';
export type Section = 'overview' | 'applications' | 'configuration' | 'versions' | 'files' | 'system' | 'kill-switch';
export interface AdminApp {
  id: number;
  name: string;
  icon: string | null;
  mode: Mode;
  currentVersionId: string | null;
}
export interface Version {
  id: string;
  applicationId: number;
  label: string;
  releaseKey: string;
  active: boolean;
  published: boolean;
}
export interface Artifact {
  id: string;
  versionId: string;
  variantKey: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: ScanStatus;
  active: boolean;
  retired: boolean;
}
export interface AppDetail {
  app: AdminApp;
  versions: Version[];
  files: Artifact[];
  blockers: string[];
  directActivationAllowed: boolean;
}
export interface SystemStatus {
  checkedAt: string;
  enabled: boolean;
  deploymentEnabled: boolean;
  migrationReady: boolean;
  storageReady: boolean;
  ingressReady: boolean;
  blockers: string[];
  budget: null | {
    verified: boolean;
    limitBytes: number;
    reservedBytes: number;
    startsAt: string;
    expiresAt: string;
  };
}
export interface VersionInput {
  application_id: number;
  version_label: string;
  release_key: string;
  active: boolean;
  published: boolean;
}
export interface FileInput {
  version_id: string;
  variant_key: string;
  artifact_type: 'apk';
  size_bytes: number;
  sha256: string;
  mime_type: 'application/vnd.android.package-archive';
  download_filename: string;
  storage_backend: string;
  storage_key: string;
  storage_object_version: string | null;
}
export interface ConfigInput {
  mode: Mode;
  current_version_id: string | null;
}
