import 'server-only';
import { S3Client, HeadObjectCommand, GetObjectCommand, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DownloadError, safeFilename } from '../rules';
import type { DownloadStorage, ObjectRef, ObjectMetadata, DeliveryGrant } from '../storage';

export const APK_MIME = 'application/vnd.android.package-archive';
export type S3StorageConfig = {
  backend: 'railway-s3' | 's3'; endpoint: string; region: string; bucket: string;
  accessKeyId: string; secretAccessKey: string; allowedHosts: readonly string[];
  forcePathStyle: boolean; versioningEnabled: boolean;
  checksumSource: 'metadata' | 'provider'; timeoutMs: number;
};
type Dependencies = {
  client?: { send(command: HeadObjectCommand, options: { abortSignal: AbortSignal }): Promise<HeadObjectCommandOutput> };
  sign?: (command: GetObjectCommand, options: { expiresIn: number; signingDate: Date }) => Promise<string>;
};
const unavailable = () => new DownloadError(503, 'STORAGE_UNAVAILABLE');
const integrity = () => new DownloadError(503, 'FILE_INTEGRITY_UNAVAILABLE');
const hostname = (value: string) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)
  && !value.includes('..') && value.split('.').every(p => p.length <= 63 && !p.startsWith('-') && !p.endsWith('-'));
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function validateConfig(config: S3StorageConfig) {
  let endpoint: URL;
  try { endpoint = new URL(config.endpoint); } catch { throw unavailable(); }
  if (!['railway-s3', 's3'].includes(config.backend) || endpoint.protocol !== 'https:' || endpoint.username
    || endpoint.password || endpoint.port || endpoint.search || endpoint.hash || endpoint.pathname !== '/'
    || !hostname(endpoint.hostname) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket)
    || !/^[a-z0-9-]{1,63}$/.test(config.region) || !config.accessKeyId || !config.secretAccessKey
    || !['metadata', 'provider'].includes(config.checksumSource)
    || !Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 2500
    || typeof config.forcePathStyle !== 'boolean' || typeof config.versioningEnabled !== 'boolean'
    || (config.backend === 'railway-s3' && config.versioningEnabled)
    || !config.allowedHosts.length || config.allowedHosts.some(h => !hostname(h))) throw unavailable();
  const deliveryHost = config.forcePathStyle ? endpoint.hostname : `${config.bucket}.${endpoint.hostname}`;
  if (!config.allowedHosts.includes(deliveryHost)) throw unavailable();
  return { endpoint: endpoint.origin, deliveryHost };
}

/** Server-owned, canonical content-addressed APK keys. No decoding/normalization is performed. */
export function validS3ObjectKey(key: string): boolean {
  return /^artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-f0-9]{64}\.apk$/.test(key);
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3StorageConfig | undefined {
  const backend = env.DOWNLOAD_STORAGE_BACKEND;
  if (!backend) return undefined;
  if (backend !== 'railway-s3' && backend !== 's3') throw unavailable();
  const boolean = (name: string) => {
    if (env[name] && env[name] !== 'true' && env[name] !== 'false') throw unavailable();
    return env[name] === 'true';
  };
  const config: S3StorageConfig = {
    backend, endpoint: env.DOWNLOAD_S3_ENDPOINT || '', region: env.DOWNLOAD_S3_REGION || '',
    bucket: env.DOWNLOAD_S3_BUCKET || '', accessKeyId: env.DOWNLOAD_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.DOWNLOAD_S3_SECRET_ACCESS_KEY || '',
    allowedHosts: (env.DOWNLOAD_ALLOWED_DELIVERY_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean),
    forcePathStyle: boolean('DOWNLOAD_S3_FORCE_PATH_STYLE'), versioningEnabled: boolean('DOWNLOAD_S3_VERSIONING_ENABLED'),
    checksumSource: (env.DOWNLOAD_S3_CHECKSUM_SOURCE || 'metadata') as S3StorageConfig['checksumSource'],
    timeoutMs: env.DOWNLOAD_S3_TIMEOUT_MS ? Number(env.DOWNLOAD_S3_TIMEOUT_MS) : 2500,
  };
  validateConfig(config);
  return config;
}

/** Private S3 origin: authenticated HEAD and local SigV4 GET signing; never reads APK bytes. */
export class S3DownloadStorage implements DownloadStorage {
  private readonly config: S3StorageConfig;
  private readonly deliveryHost: string;
  private readonly client: NonNullable<Dependencies['client']>;
  private readonly sign: NonNullable<Dependencies['sign']>;
  // Weak ownership records do not retain grants/URLs beyond the request lifetime.
  private readonly grants = new WeakMap<DeliveryGrant, { url: string; key: string; version?: string;
    expiry: number; signedAt: string; ttl: number; disposition: string }>();

  constructor(config: S3StorageConfig, dependencies: Dependencies = {}) {
    const validated = validateConfig(config);
    this.config = Object.freeze({ ...config, endpoint: validated.endpoint, allowedHosts: Object.freeze([...config.allowedHosts]) });
    this.deliveryHost = validated.deliveryHost;
    const sdk = new S3Client({ endpoint: this.config.endpoint, region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: config.forcePathStyle, maxAttempts: 1,
      requestHandler: { connectionTimeout: 1500, requestTimeout: config.timeoutMs },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.client = dependencies.client ?? sdk;
    this.sign = dependencies.sign ?? ((command, options) => getSignedUrl(sdk, command, options));
  }

  private validateRef(ref: ObjectRef) {
    if (ref.backend !== this.config.backend || !validS3ObjectKey(ref.key)
      || (ref.objectVersion !== undefined && (!this.config.versioningEnabled
        || !ref.objectVersion || ref.objectVersion === 'null' || ref.objectVersion.length > 1024
        || /[\x00-\x20\x7f]/.test(ref.objectVersion)))) throw integrity();
  }

  private async bounded<T>(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (signal.aborted) throw unavailable();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    try {
      const stopped = new Promise<never>((_, reject) => {
        abort = () => { controller.abort(); reject(unavailable()); };
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, this.config.timeoutMs);
      });
      return await Promise.race([stopped, operation(controller.signal)]);
    } catch (error) {
      if (controller.signal.aborted) throw unavailable();
      if (error instanceof DownloadError) throw error;
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
      if (e?.$metadata?.httpStatusCode === 404 || ['NoSuchKey', 'NoSuchVersion', 'NotFound'].includes(e?.name || ''))
        throw new DownloadError(404, 'FILE_UNAVAILABLE');
      throw unavailable(); // Never expose provider messages, credentials, bucket/key or signature.
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  async headObject(ref: ObjectRef, signal: AbortSignal): Promise<ObjectMetadata> {
    this.validateRef(ref);
    return this.bounded(signal, async abortSignal => {
      const metadata = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: ref.key,
        ...(ref.objectVersion !== undefined ? { VersionId: ref.objectVersion } : {}),
        ...(this.config.checksumSource === 'provider' ? { ChecksumMode: 'ENABLED' } : {}),
      }), { abortSignal });
      let sha256: string;
      if (this.config.checksumSource === 'metadata') {
        // Only trusted offline publishing credentials may set x-amz-meta-sha256; ETag is never a hash fallback.
        sha256 = metadata.Metadata?.sha256 || '';
      } else {
        const checksum = metadata.ChecksumSHA256 || '';
        // Multipart/composite digests are not full-object SHA-256.
        if (metadata.ChecksumType === 'COMPOSITE' || !/^[A-Za-z0-9+/]{43}=$/.test(checksum)) throw integrity();
        const bytes = Buffer.from(checksum, 'base64');
        if (bytes.length !== 32 || bytes.toString('base64') !== checksum) throw integrity();
        sha256 = bytes.toString('hex');
      }
      if (!Number.isSafeInteger(metadata.ContentLength) || metadata.ContentLength! <= 0 || metadata.DeleteMarker
        || metadata.ContentType !== APK_MIME || !/^[a-f0-9]{64}$/.test(sha256)
        || !ref.key.endsWith(`/${sha256}.apk`)
        || (ref.objectVersion !== undefined && metadata.VersionId !== ref.objectVersion)) throw integrity();
      return { sizeBytes: BigInt(metadata.ContentLength!), contentType: APK_MIME, sha256,
        ...(metadata.VersionId && metadata.VersionId !== 'null' ? { objectVersion: metadata.VersionId } : {}) };
    });
  }

  async createDeliveryGrant(input: Parameters<DownloadStorage['createDeliveryGrant']>[0], signal: AbortSignal): Promise<DeliveryGrant> {
    this.validateRef(input.ref);
    if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 30 || input.expiresInSeconds > 300
      || !safeFilename(input.filename) || /[";%]/.test(input.filename) || input.contentType !== APK_MIME) throw integrity();
    return this.bounded(signal, async () => {
      // SigV4 timestamps have whole-second precision. Report the actual signed expiry.
      const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000);
      const ascii = input.filename.replace(/[^\x20-\x7e]/g, '_');
      const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encode(input.filename)}`;
      const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: input.ref.key,
        ...(input.ref.objectVersion !== undefined ? { VersionId: input.ref.objectVersion } : {}),
        ResponseContentDisposition: disposition, ResponseContentType: APK_MIME,
        ResponseCacheControl: 'private, no-store',
        // Range/If-Range intentionally unsigned, permitting retries/resume until expiry.
      });
      const url = await this.sign(command, { expiresIn: input.expiresInSeconds, signingDate });
      const grant = { url, expiresAt: new Date(signingDate.getTime() + input.expiresInSeconds * 1000), deliveryHost: this.deliveryHost };
      this.grants.set(grant, { url, key: input.ref.key, version: input.ref.objectVersion, expiry: grant.expiresAt.getTime(),
        signedAt: signingDate.toISOString().replace(/[:-]|\.\d{3}/g, ''), ttl: input.expiresInSeconds, disposition });
      if (!this.matchesObject(grant, input.ref)) throw unavailable();
      return grant;
    });
  }

  matchesObject(grant: DeliveryGrant, ref: ObjectRef): boolean {
    try {
      this.validateRef(ref);
      const owned = this.grants.get(grant);
      if (!owned || owned.url !== grant.url || owned.key !== ref.key || owned.version !== ref.objectVersion
        || owned.expiry !== grant.expiresAt.getTime()) return false;
      const url = new URL(grant.url), params = url.searchParams;
      const path = '/' + (this.config.forcePathStyle ? this.config.bucket + '/' : '') + ref.key.split('/').map(encode).join('/');
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
        || url.hostname !== this.deliveryHost || grant.deliveryHost !== this.deliveryHost
        || !this.config.allowedHosts.includes(url.hostname) || url.pathname !== path) return false;
      const keys = [...params.keys()];
      if (new Set(keys).size !== keys.length || params.get('versionId') !== (ref.objectVersion ?? null)
        || params.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256'
        || !/^[a-f0-9]{64}$/.test(params.get('X-Amz-Signature') || '')
        || params.get('X-Amz-SignedHeaders') !== 'host'
        || params.get('X-Amz-Expires') !== String(owned.ttl) || params.get('X-Amz-Date') !== owned.signedAt
        || params.get('X-Amz-Credential') !== `${this.config.accessKeyId}/${owned.signedAt.slice(0, 8)}/${this.config.region}/s3/aws4_request`
        || params.get('response-content-type') !== APK_MIME
        || params.get('response-content-disposition') !== owned.disposition
        || params.get('response-cache-control') !== 'private, no-store'
        || params.has('uploadId') || params.has('partNumber')) return false;
      return true;
    } catch { return false; }
  }
}

/** Missing/invalid provider configuration fails closed without breaking unrelated catalog builds. */
export function configuredStorageAdapters(env: NodeJS.ProcessEnv = process.env): Readonly<Record<string, DownloadStorage>> {
  try {
    const config = s3ConfigFromEnv(env);
    return Object.freeze(config ? { [config.backend]: new S3DownloadStorage(config) } : {});
  } catch { return Object.freeze({}); }
}
