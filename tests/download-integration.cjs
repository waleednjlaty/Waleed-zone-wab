const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const available = Boolean(process.env.WZ_TEST_CONFIG);
const config = available ? JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG, 'utf8')) : {};
const options = { skip: !available };
function privateHeaders(r) {
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
}
test('production download page is honest, private and has no legacy fallback or token form', options, async () => {
  const r = await fetch(config.base + '/download/201'); assert.equal(r.status, 200); privateHeaders(r);
  const html = await r.text(); assert.match(html, /التحميل المباشر غير متاح حاليًا/);
  assert.ok(!html.includes('action="/api/downloads/redeem"')); assert.ok(!html.includes('wzdl1_'));
});
test('production download APIs reject unsupported methods with safe headers', options, async () => {
  for (const route of ['session','requests','redeem','control','requests/33333333-3333-4333-8333-333333333333/token']) {
    const r = await fetch(config.base + '/api/downloads/' + route); assert.equal(r.status, 405); privateHeaders(r); assert.equal(r.headers.get('allow'), 'POST'); assert.equal(r.headers.get('location'), null);
    assert.equal((await r.json()).error.code,'METHOD_NOT_ALLOWED');
  }
});
test('production runtime denies unverified ingress without private error disclosure', options, async () => {
  const r = await fetch(config.base + '/api/downloads/session', {method:'POST',headers:{Origin:config.base,'Content-Type':'application/json','X-Forwarded-For':'198.51.100.9'},body:'{}'});
  assert.equal(r.status, 503); privateHeaders(r); const body = await r.text(); assert.equal(JSON.parse(body).error.code, 'VERIFICATION_UNAVAILABLE'); assert.ok(!/stack|SQL|postgres|password|wzdl1_|storage_key/.test(body));
});
test('production sitemap excludes download and private endpoints', options, async () => {
  const xml = await (await fetch(config.base + '/sitemap.xml')).text(); assert.ok(!/\/download|\/api\/|\/account|\/control|\/redeem/.test(xml));
});
