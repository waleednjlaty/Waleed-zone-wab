const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./helpers/typescript.cjs');
require.extensions['.css'] = module => { module.exports = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : name }); };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { deadline, secondsLeft, retrySeconds, downloadApi } = require('../src/components/download/api.ts');
const Experience = require('../src/components/download/DownloadExperience.tsx').default;
const { getDownloadPresentation } = require('../src/components/download/presentation.ts');
const files = require('../src/data/download-presentation.json');
const id = '11111111-1111-4111-8111-111111111111';
const file = { application_id: 201, version_id: id, file_id: '22222222-2222-4222-8222-222222222222', version: '9.1', size_bytes: 85000000, file_type: 'apk' };
const app = { id: 201, name: 'WhatsApp', imageUrl: null, detailHref: '/apps/whatsapp-201', version: '9.1', size: '85 MB' };

test('server-relative monotonic deadlines survive skew; countdown rounds upward', () => {
  const at = deadline('2026-10-02T04:40:20Z', '2026-10-02T04:40:00Z', 100);
  assert.equal(secondsLeft(at, 100), 20);
  assert.equal(secondsLeft(at, 1100), 19);
  assert.equal(secondsLeft(at, 20099), 1);
  assert.equal(secondsLeft(at, 20100), 0);
  assert.throws(() => deadline('invalid', 'invalid', 100));
});

test('429 follows longest server wait, including delta/date Retry-After', () => {
  const body = { server_time: '2026-10-02T04:40:00Z', error: { retry_after_seconds: 12.2, retry_at: '2026-10-02T04:40:14Z' } };
  assert.equal(retrySeconds(new Headers({ 'Retry-After': '10' }), body), 14);
  assert.equal(retrySeconds(new Headers({ 'Retry-After': 'Fri, 02 Oct 2026 04:40:30 GMT' }), body), 30);
  assert.equal(retrySeconds(new Headers(), {}), 1);
});

test('unknown artifact metadata never fabricates a direct CTA', () => {
  assert.equal(getDownloadPresentation(201), null);
  files['201'] = { ...file, application_id: 202 };
  assert.equal(getDownloadPresentation(201), null);
  files['201'] = { ...file, size_bytes: 0 };
  assert.equal(getDownloadPresentation(201), null);
  files['201'] = file;
  assert.deepEqual(getDownloadPresentation(201), file);
  delete files['201'];
  const markup = renderToStaticMarkup(React.createElement(Experience, { app, file: null }));
  assert.match(markup, /التحميل المباشر غير متاح حاليًا/);
  assert.ok(!/<button[^>]*>تجهيز رابط التحميل/.test(markup));
});

test('initial known data uses real summary, native POST and no countdown skeleton', () => {
  const markup = renderToStaticMarkup(React.createElement(Experience, { app, file }));
  assert.match(markup, /85 MB/); assert.match(markup, />APK</);
  assert.match(markup, /action="\/api\/downloads\/redeem" method="post" target="_blank"/);
  assert.match(markup, /aria-live="polite"/);
  assert.ok(!markup.includes('skeleton') && !markup.includes('wzdl1_'));
});

test('API adapter sends exact contract bodies, keeps cookies, ignores signed/status URLs', async () => {
  const original = global.fetch, calls = [];
  global.fetch = async (path, options) => {
    calls.push([path, options]);
    return new Response(JSON.stringify({ request_id: id, state: 'pending', server_time: '2026-10-02T04:40:00Z', ready_at: '2026-10-02T04:40:20Z', request_expires_at: '2026-10-02T04:45:20Z', status_url: 'https://evil.example', signed_url: 'private' }), { status: 201 });
  };
  try {
    const result = await downloadApi.request(file, 'csrf-memory-only', id);
    assert.deepEqual(JSON.parse(calls[0][1].body), { application_id: 201, version_id: file.version_id, file_id: file.file_id });
    assert.equal(calls[0][1].headers['X-CSRF-Token'], 'csrf-memory-only');
    assert.equal(calls[0][1].headers['Idempotency-Key'], id);
    assert.equal(calls[0][1].credentials, 'same-origin');
    assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(result.signed_url, undefined); assert.equal(result.status_url, undefined);
  } finally { global.fetch = original; }
});

test('malformed JSON and external redemption destinations fail closed', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => new Response('not-json', { status: 200 });
    await assert.rejects(downloadApi.session(), /INVALID_RESPONSE/);
    global.fetch = async () => new Response(JSON.stringify({ token: 'wzdl1_' + 'a'.repeat(43), server_time: '2026-10-02T04:40:20Z', token_expires_at: '2026-10-02T04:41:20Z', redeem_url: 'https://evil.example/redeem' }));
    await assert.rejects(downloadApi.token(id, 'csrf'), /INVALID_RESPONSE/);
  } finally { global.fetch = original; }
});
