# Phase 4 private S3 storage adapter — Agent L

Implements issue #28 against `DownloadStorage`, starting at main `1581874aab782b5e853ba097b76537f5f062927f`. No cloud resources, credentials, files, production migrations, billing or enablement changes are part of this PR.

## Integration and configuration contract

`storage.ts` builds a frozen server-only registry from reviewed deployment configuration. `DOWNLOAD_STORAGE_BACKEND=railway-s3` registers the Railway adapter under that exact backend; `s3` uses the same implementation for a later reviewed compatible provider. Missing or invalid configuration produces an empty registry and denies direct-file eligibility; it does not throw during unrelated catalog builds. `s3ConfigFromEnv` also exposes strict validation for an operator preflight without network access. Restart the service to apply changes. The existing deployment and PostgreSQL enablement gates are independent and remain off.

| Variable | Required when backend is selected | Contract |
| --- | --- | --- |
| `DOWNLOAD_STORAGE_BACKEND` | Yes | Empty disables registration; `railway-s3` or `s3` only. File metadata backend must match exactly. |
| `DOWNLOAD_S3_ENDPOINT` | Yes | Base HTTPS endpoint from bucket credentials, no userinfo, port, path, query or fragment. No request-supplied endpoints. |
| `DOWNLOAD_S3_REGION` | Yes | Signing region from provider credentials; Railway publishes `REGION` (example `auto`). |
| `DOWNLOAD_S3_BUCKET` | Yes | Actual S3 `BUCKET`, not the Railway display name. DNS-safe 3–63 lowercase alphanumeric/hyphen characters; dotted buckets deliberately excluded for predictable TLS host matching. |
| `DOWNLOAD_S3_ACCESS_KEY_ID` | Yes | Server-only read/sign credential; separate from publishing credentials. No SDK ambient/default credential chain. |
| `DOWNLOAD_S3_SECRET_ACCESS_KEY` | Yes | Server-only secret. Static credentials only; temporary/session credentials are outside this adapter contract. |
| `DOWNLOAD_ALLOWED_DELIVERY_HOSTS` | Yes | Existing comma-separated exact hostname allowlist; no scheme, wildcard or port. Must contain the generated provider host. |
| `DOWNLOAD_S3_FORCE_PATH_STYLE` | No | Strict `true`/`false`, default false. Current Railway uses virtual hosted style; older buckets can require true. Follow the actual bucket credentials. |
| `DOWNLOAD_S3_VERSIONING_ENABLED` | No | Strict `true`/`false`, default false. Railway rejects true because versioning is currently unsupported. Other providers must be independently verified. |
| `DOWNLOAD_S3_CHECKSUM_SOURCE` | No | `metadata` (default) or `provider`, with no automatic fallback. |
| `DOWNLOAD_S3_TIMEOUT_MS` | No | Integer 100–2500 ms, default 2500, per HEAD/sign operation; existing `prepareDelivery` retains its 3000 ms combined deadline. |

Example **synthetic**, nonfunctional configuration: endpoint `https://storage.example.test`, bucket `wz-fixture`, virtual delivery hostname `wz-fixture.storage.example.test`; path style hostname `storage.example.test`. Presigned URLs are never rewritten to a custom CDN hostname. None of these values is installed in any deployment.

Railway exposes bucket `ENDPOINT`, `REGION`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` as variable references. Map those to the corresponding `DOWNLOAD_S3_*` values above only in a separately authorized future setup. Every secret stays outside `NEXT_PUBLIC_*` and browser bundles. The SDK performs no storage operation merely by constructing the registry.

## Object identity, trusted checksums and publishing prerequisites

The adapter accepts only canonical `artifacts/<lowercase-file-uuid>/<64-lowercase-hex-sha256>.apk` keys, with a standard version 1–8 UUID and RFC variant. This narrows the spec's content-addressed key example into an explicit publisher/metadata contract. No normalization, traversal, URL decoding, caller URL, alternate prefix or archive extension is accepted. HEAD checksum must match the hash in that exact key; the existing service additionally compares HEAD bytes, hash, MIME and requested version against the verified database row. XAPK/ZIP delivery requires a separate reviewed contract extension.

`metadata`: authenticated HEAD must provide `x-amz-meta-sha256` as exactly 64 lowercase hex characters. This is trusted **only because an offline publishing operator computes/verifies the full-object digest and sets the metadata using separate controlled credentials**. A metadata hash alone does not prove the bytes, provenance or malware safety. Missing metadata fails closed; `ETag`, arbitrary checksums and the key hash alone are never substitutes. No provider `ChecksumMode` is requested in this mode, avoiding an assumption about Railway checksum-header support.

`provider`: HEAD requests `ChecksumMode=ENABLED`. Accepts only canonical base64 of a 32-byte `ChecksumSHA256` and rejects composite/multipart checksums and mismatched content-addressed keys. If the provider omits the checksum, redemption fails; it never falls back to metadata/ETag. Provider support/semantics must be confirmed before selecting this mode.

Metadata must describe positive safe-integer bytes, exact `application/vnd.android.package-archive`, and a nondeleted object. If an object version is supplied, enabled version support is required, HEAD must report that exact ID, and GET is signed with the same `versionId`. `null`/empty/oversized/control-containing version IDs are rejected. No lookup silently substitutes the latest version.

Railway currently documents no object versioning/locks. For it, file records omit objectVersion and the publisher must **never overwrite a published content-addressed key**, restrict write credentials, and withdraw references before deletion. HEAD plus a signature cannot independently eliminate a replacement race without that publishing control. Even on a versioned provider, an unversioned ref still requires the same immutability rule. This PR provides no publishing tool or production validation.

## Delivery and failure behavior

Authenticated SDK HEAD is the only network operation. Local AWS SigV4 signing uses `GetObjectCommand` only; no PUT/list/delete/body download APIs exist. Attachment filename validation rejects slash, backslash, control characters, quote, semicolon and percent injection. Signed response overrides include an ASCII fallback plus RFC 5987 UTF-8 filename, exact APK MIME and `private, no-store` cache control.

Requested TTL must be an integer 30–300 seconds. Expiry is derived from the actual whole-second SigV4 signing timestamp, so effective remaining time is up to one second shorter than the requested TTL. Existing redemption requests 300 seconds and rechecks at least 30 seconds remaining before consumption. A caller requesting exactly 30 seconds must account for the existing minimum-remaining-time validator rejecting a grant after any elapsed time. The adapter uses static credentials with no temporary session expiry to overstate.

The URL must match the configured HTTPS host, exact encoded bucket/key path, exact object version, signing credential scope/date/TTL, APK/disposition/cache overrides, and host-only signed headers. Weak ownership records bind the original grant to the exact GET invocation and full untouched URL. Foreign, cloned, modified, redirected, wrong-bucket and wrong-version grants fail matching. Records are garbage collected with the grant. The existing `validateGrant` remains an independent final check. Do not serialize/reconstruct a grant between signing and validation.

No `Range` or `If-Range` header is signed or required, so browser/provider range retries are compatible with a reusable GET URL during its TTL. No website cookie is needed at storage. This establishes the signing contract, **not proof that Railway serves 206 responses or resumes successfully on mobile**. Actual Range, If-Range, 416, expiry/reconnect, disposition/MIME, unsigned-origin denial and native 303/CSP behavior remain preactivation provider gates. No CSP/SEO/UI changes occur here.

Both caller AbortSignal and an adapter deadline terminate waiting. HEAD receives a linked AbortSignal. Signer work is local; if it cannot be cancelled internally, its eventual result is discarded. SDK retries are disabled (`maxAttempts=1`), with bounded connection/request timeouts. Explicit missing key/version or HTTP 404 maps to `404 FILE_UNAVAILABLE`; permission, network, timeout, throttling and other SDK/sign failures map to `503 STORAGE_UNAVAILABLE`; bad object identity/metadata/input maps to `503 FILE_INTEGRITY_UNAVAILABLE`. Provider messages, URLs, bucket/key and secrets are never included in mapped errors/logs.

## Validation and remaining release gates

`tests/storage-s3.cjs` uses synthetic metadata, an intercepted SDK request handler with no sockets, and real **local** SDK presigning with fixture credentials. Tests exercise authenticated exact HEAD, strict config/keys, trusted SHA-256 and ETag rejection, metadata mismatches, versions, virtual/path style, GET signature, header overrides, TTL bounds, exact-object matching/tampering, safe errors, cancellation, timeout and `prepareDelivery` compatibility. No live bucket, production DB, credential or APK is accessed.

Local validation on Node 20.19.5:

- `npm run typecheck`: pass.
- `npm test`: 207 pass, 0 fail, 46 skipped, 0 TODO. Skips are the existing 45 production-server integration cases (no `WZ_TEST_CONFIG`) and the native PostgreSQL lifecycle suite (no dedicated local `WZ_DOWNLOAD_TEST_DATABASE_URL`). The in-process PGlite download contracts execute.
- `node --test tests/storage-s3.cjs`: final 24 adapter cases pass, 0 fail, 0 skipped; includes the separately added independent SigV4 HMAC/method verification.
- `npm run build`: pass, including Next.js lint/type validation.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities at this check.
- Browser output check: server credential variable names and synthetic fixture secrets are absent from `.next/static`.

Direct dependencies added (exact pinned versions): `@aws-sdk/client-s3@3.1145.0`, `@aws-sdk/s3-request-presigner@3.1145.0`; lockfile includes their transitive dependencies. No service subscription is involved.

Before activation, a separately scoped operator must verify actual Railway account/free-credit budget limits and provider behavior, authentic offline file metadata, immutable publishing restrictions, read/sign permissions, ingress, database migration and the shared/deployment gates from the Phase 3 review. This PR does not enable direct downloads or claim a zero-cost unlimited service.

Primary references checked 2026-10-02:

- [Railway Storage Buckets](https://docs.railway.com/storage-buckets): private S3 support, variable references, URL styles, versioning limitation.
- [AWS SDK v3 HeadObject](https://docs.aws.amazon.com/goto/SdkForJavaScriptV3/s3-2006-03-01/HeadObject): authenticated metadata/checksum interface.
- [Amazon S3 HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html): metadata and checksum semantics.
- [Amazon S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html): exact key/version, signed response overrides and Range.
- [AWS SDK v3 request presigner](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner): local method-bound signing.
