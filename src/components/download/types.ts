/** Public presentation data only. API eligibility checks remain authoritative. */
export interface DownloadFile {
  application_id: number;
  version_id: string;
  file_id: string;
  version: string;
  size_bytes: number;
  file_type?: 'apk' | 'apks' | 'xapk' | 'obb' | 'zip';
}

export interface DownloadApp {
  id: number;
  name: string;
  imageUrl: string | null;
  detailHref: string;
  version: string | null;
  size: string | null;
}

export type DownloadState = 'INITIAL' | 'LOADING' | 'COUNTDOWN' | 'READY' | 'DOWNLOADING'
  | 'RATE_LIMITED' | 'EXPIRED' | 'FAILED' | 'SUCCESS';

export interface DownloadRequest {
  request_id: string;
  state: 'pending' | 'ready' | 'issued' | 'redeemed' | 'expired' | 'revoked';
  server_time: string;
  ready_at: string;
  request_expires_at: string;
}

export interface DownloadToken {
  token: string;
  server_time: string;
  token_expires_at: string;
  redeem_url: '/api/downloads/redeem';
}
