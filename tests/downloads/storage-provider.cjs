'use strict';
// In-process private-provider MODEL, not S3/SigV4 and not Railway certification.
// Only external storage is faked. No socket, fetch, disk artifact or APK is used.
const { createHmac, timingSafeEqual } = require('node:crypto');
const F = require('./fixtures.cjs');
const MIME = 'application/vnd.android.package-archive';
const HOST = 'delivery.example.test';
const REF = Object.freeze({ backend: 'qa', key: F.storageKey, objectVersion: 'qa-v1' });
const INPUT = Object.freeze({ sizeBytes: BigInt(F.bytes.length), sha256: F.sha256,
  contentType: MIME, filename: 'qa.apk', requestId: '33333333-3333-4333-8333-333333333333' });

function createProvider() {
  const calls = [];
  const same = ref => ref.backend === REF.backend && ref.key === REF.key && ref.objectVersion === REF.objectVersion;
  const signature = value => createHmac('sha256', 'QA_SIGNING_SECRET').update(value).digest('hex');
  const canonical = (url, method) => method + '\n' + url.origin + url.pathname + '\n' +
    [...url.searchParams].filter(([key]) => key !== 'signature').map(([k, v]) => [k, v]).sort().map(pair => JSON.stringify(pair)).join('\n');
  function authorized(url, method) {
    const expected = signature(canonical(url, method)), actual = url.searchParams.get('signature') || '';
    return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }
  const abort = signal => signal.throwIfAborted();
  const adapter = {
    async headObject(ref, signal) {
      abort(signal); calls.push({ method: 'HEAD', ref: { ...ref }, signal });
      if (!same(ref)) throw Error('mock exact object absent');
      return { ...F.fixtureData().storage.metadata };
    },
    async createDeliveryGrant(input, signal) {
      abort(signal); calls.push({ method: 'SIGN_GET', input: { ...input, ref: { ...input.ref } }, signal });
      if (!same(input.ref) || !Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 30 || input.expiresInSeconds > 300)
        throw Error('mock invalid object or TTL');
      const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
      const url = new URL('https://' + HOST + '/' + input.ref.key);
      url.searchParams.set('versionId', input.ref.objectVersion);
      url.searchParams.set('expires', String(expiresAt.getTime()));
      url.searchParams.set('response-content-type', input.contentType);
      url.searchParams.set('response-content-disposition', 'attachment; filename="' + input.filename + '"');
      url.searchParams.set('signature', signature(canonical(url, 'GET')));
      return { url: url.href, expiresAt, deliveryHost: HOST };
    },
    matchesObject(grant, ref) {
      try {
        const url = new URL(grant.url);
        return same(ref) && url.pathname === '/' + ref.key && url.searchParams.get('versionId') === ref.objectVersion
          && url.searchParams.get('expires') === String(grant.expiresAt.getTime()) && authorized(url, 'GET');
      } catch { return false; }
    },
  };
  // Simulates the storage boundary only. Tests never follow a Next.js 303.
  function request(value, { method = 'GET', range } = {}) {
    const url = new URL(value);
    if (url.origin !== 'https://' + HOST || url.pathname !== '/' + REF.key
      || url.searchParams.get('versionId') !== REF.objectVersion || !authorized(url, method)
      || Date.now() >= Number(url.searchParams.get('expires'))) return new Response(null, { status: 403 });
    const headers = { 'Content-Type': url.searchParams.get('response-content-type'),
      'Content-Disposition': url.searchParams.get('response-content-disposition'), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' };
    if (!range) return new Response(F.bytes, { headers: { ...headers, 'Content-Length': String(F.bytes.length) } });
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = Number(match?.[1]), end = match?.[2] ? Number(match[2]) : F.bytes.length - 1;
    if (!match || start > end || start >= F.bytes.length || end >= F.bytes.length)
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + F.bytes.length } });
    return new Response(F.bytes.subarray(start, end + 1), { status: 206, headers: { ...headers,
      'Content-Range': `bytes ${start}-${end}/${F.bytes.length}`, 'Content-Length': String(end - start + 1) } });
  }
  return { adapter, calls, request };
}
module.exports = { createProvider, REF, INPUT, HOST, MIME };
