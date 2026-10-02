import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const requestId = '33333333-3333-4333-8333-333333333333';
const versionId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
const token = 'wzdl1_' + 'a'.repeat(43);
const csrf = 'csrf-test-memory-only';
const time = offset => new Date(Date.parse('2026-10-02T04:40:00Z') + offset * 1000).toISOString();

export async function verifyDownloadUI({ base, root }) {
  const { chromium } = await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.WZ_BROWSER_EXECUTABLE ? { executablePath: process.env.WZ_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox'] });
  let checks = 0;
  const screenshotDir = process.env.WZ_DOWNLOAD_SCREENSHOTS;
  if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
  const fixture = async (width = 360, mode = '') => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], calls = [];
    let admitted = false, redeemed = false, requestAttempts = 0, tokenAttempts = 0;
    let statusOffset = 20, tokenTTL = 60;
    const json = (route, data, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(data) });
    const error = (route, code, status, seconds = 0) => json(route, { error: { code, retry_after_seconds: seconds }, server_time: time(0) }, status, seconds ? { 'Retry-After': String(seconds) } : {});
    const status = () => ({ request_id: requestId, state: redeemed ? 'redeemed' : admitted ? 'issued' : 'pending', server_time: time(statusOffset), ready_at: time(20), request_expires_at: time(320) });
    page.on('pageerror', e => errors.push(e.message));
    // Expected API HTTP failures log to Chrome console; runtime errors must be absent.
    await context.route('**/api/downloads/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      calls.push({ path, method: request.method(), body: request.postData(), headers: request.headers() });
      if (path.endsWith('/session')) return json(route, { csrf_token: csrf, server_time: time(0) });
      if (path === '/api/downloads/requests') {
        requestAttempts++;
        if (mode === 'rate' && requestAttempts === 1) return error(route, 'RATE_LIMITED', 429, 14);
        if (mode === 'csrf' && requestAttempts === 1) return error(route, 'CSRF_REJECTED', 403);
        if (mode === 'network' && requestAttempts === 1) return route.abort('failed');
        if (mode === 'unavailable') return error(route, 'FILE_UNAVAILABLE', 404);
        admitted = true;
        return json(route, { ...status(), state: 'pending', server_time: time(0) }, 201);
      }
      if (path.endsWith('/token')) {
        tokenAttempts++;
        if (mode === 'early' && tokenAttempts === 1) return error(route, 'DOWNLOAD_NOT_READY', 425, 2);
        if (mode === 'token-rate' && tokenAttempts === 1) return error(route, 'RATE_LIMITED', 429, 7);
        if (mode === 'token-expired' && tokenAttempts === 1) return error(route, 'REQUEST_EXPIRED', 410);
        return json(route, { token, token_expires_at: time(20 + tokenTTL), server_time: time(20), redeem_url: '/api/downloads/redeem' });
      }
      if (path === '/api/downloads/redeem') {
        assert.equal(request.method(), 'POST');
        const body = new URLSearchParams(request.postData());
        assert.equal(body.get('request_id'), requestId); assert.equal(body.get('token'), token); assert.equal(body.get('csrf_token'), csrf);
        assert.ok(!request.url().includes(token));
        if (mode === 'redeem-error') return route.fulfill({ status: 429, contentType: 'text/html; charset=utf-8', headers: { 'Retry-After': '10' }, body: '<html lang="ar" dir="rtl"><h1 data-download-error="RATE_LIMITED">انتظر 10 ثوانٍ</h1><a href="/">العودة إلى صفحة التحميل</a></html>' });
        redeemed = true;
        return route.fulfill({ status: 303, headers: { Location: base + '/qa-download.txt' }, body: '' });
      }
      if (path === `/api/downloads/requests/${requestId}`) return json(route, status());
      return error(route, 'REQUEST_NOT_FOUND', 404);
    });
    await context.route('**/qa-download.txt', route => route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Content-Disposition': 'attachment; filename="qa-download.txt"' }, body: 'Disposable QA fixture: no APK bytes.' }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).waitFor();
    await page.waitForFunction(() => Object.keys(document.querySelector('main button') || {}).some(key => key.startsWith('__reactProps')));
    await page.clock.install();
    return { page, context, calls, errors, setStatusOffset: value => { statusOffset = value; }, setTokenTTL: value => { tokenTTL = value; }, close: async () => { assert.deepEqual(errors, []); await context.close(); } };
  };
  const state = async (page, value) => {
    try { await page.locator(`[data-download-state="${value}"]`).waitFor({ timeout: 10000 }); }
    catch (error) { console.error('Download state diagnostics', value, await page.locator('main').innerText()); throw error; }
  };
  const prepare = async page => { await page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).click(); await state(page, 'COUNTDOWN'); };
  const ready = async page => {
    await page.waitForFunction(() => ['COUNTDOWN', 'READY'].includes(document.querySelector('[data-download-state]')?.getAttribute('data-download-state') || ''));
    if (await page.locator('[data-download-state]').getAttribute('data-download-state') === 'COUNTDOWN') {
      const remaining = Number((await page.getByRole('timer').innerText()).split('\n')[0]);
      await page.clock.fastForward(Math.max(1000, remaining * 1000 + 500));
    }
    await state(page, 'READY');
  };
  const noOverflow = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  try {
    for (const width of [360, 768, 1440]) {
      const f = await fixture(width);
      assert.equal(f.calls.length, 0, 'GET/prefetch must not reserve a request');
      await noOverflow(f.page);
      if (screenshotDir) await f.page.screenshot({ path: join(screenshotDir, `download-${width}-initial.png`), fullPage: true });
      // Keyboard-first admission.
      await f.page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).focus();
      await f.page.keyboard.press('Enter'); await state(f.page, 'COUNTDOWN');
      assert.equal(await f.page.getByRole('timer').innerText(), '20\nثانية متبقية');
      await f.page.clock.fastForward(1000);
      assert.equal(await f.page.getByRole('timer').innerText(), '19\nثانية متبقية');
      assert.equal(f.calls.filter(c => c.path.endsWith('/token')).length, 0);
      assert.equal(await f.page.locator('[class*="skeleton"]').count(), 0);
      assert.equal(await f.page.getByRole('progressbar').evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await f.page.locator('main').getByRole('button').isDisabled(), true);
      await noOverflow(f.page);
      if (screenshotDir) await f.page.screenshot({ path: join(screenshotDir, `download-${width}-countdown.png`), fullPage: true });
      await ready(f.page);
      assert.equal(await f.page.locator('#download-status-title').evaluate(n => n === document.activeElement), true);
      assert.equal(f.calls.filter(c => c.path.endsWith('/token')).length, 1);
      const admission = f.calls.find(c => c.path === '/api/downloads/requests');
      assert.deepEqual(JSON.parse(admission.body), { application_id: 201, version_id: versionId, file_id: fileId });
      assert.match(admission.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
      assert.equal(admission.headers['x-csrf-token'], csrf);
      const storage = await f.page.evaluate(() => JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } }));
      assert.ok(!storage.includes(token) && !storage.includes(csrf));
      if (screenshotDir) await f.page.screenshot({ path: join(screenshotDir, `download-${width}-ready.png`), fullPage: true });
      await f.page.keyboard.press('Tab');
      assert.equal(await f.page.getByRole('button', { name: 'تحميل الملف', exact: true }).evaluate(n => n === document.activeElement), true);
      await f.page.keyboard.press('Enter'); await state(f.page, 'DOWNLOADING');
      await f.page.waitForTimeout(300); await f.page.clock.fastForward(3500); await state(f.page, 'SUCCESS');
      assert.equal(f.calls.filter(c => c.path === '/api/downloads/redeem').length, 1);
      assert.match(await f.page.locator('main').innerText(), /لا تستطيع تأكيد اكتمال/);
      if (screenshotDir && width === 360) await f.page.screenshot({ path: join(screenshotDir, 'download-360-success.png'), fullPage: true });
      await f.close(); checks++;
    }

    for (const mode of ['rate', 'token-rate']) {
      const f = await fixture(360, mode);
      await f.page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).click();
      if (mode === 'token-rate') { await state(f.page, 'COUNTDOWN'); await f.page.clock.fastForward(21000); }
      await state(f.page, 'RATE_LIMITED');
      assert.equal(await f.page.locator('main').getByRole('button').isDisabled(), true);
      if (screenshotDir && mode === 'rate') await f.page.screenshot({ path: join(screenshotDir, 'download-360-rate-limited.png'), fullPage: true });
      const count = f.calls.length;
      await f.page.clock.fastForward(16000);
      assert.equal(f.calls.length, count, '429 must stop automatic retries');
      assert.equal(await f.page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).isEnabled(), true);
      await f.page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
      if (mode === 'rate') await state(f.page, 'COUNTDOWN');
      await ready(f.page);
      await f.close(); checks++;
    }

    for (const mode of ['network', 'csrf']) {
      const f = await fixture(360, mode);
      await f.page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).click(); await state(f.page, 'FAILED');
      await f.page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click(); await state(f.page, 'COUNTDOWN');
      const requests = f.calls.filter(c => c.path === '/api/downloads/requests');
      assert.equal(requests.length, 2); assert.equal(requests[0].headers['idempotency-key'], requests[1].headers['idempotency-key']);
      assert.equal(f.calls.filter(c => c.path.endsWith('/session')).length, mode === 'csrf' ? 2 : 1);
      await f.close(); checks++;
    }

    for (const mode of ['early', 'token-expired']) {
      const f = await fixture(360, mode); await prepare(f.page); await f.page.clock.fastForward(21000);
      if (mode === 'early') { await state(f.page, 'COUNTDOWN'); await f.page.clock.fastForward(3000); await state(f.page, 'READY'); }
      else { await state(f.page, 'EXPIRED'); await f.page.getByRole('button', { name: 'إعادة تجهيز الرابط', exact: true }).click(); await state(f.page, 'COUNTDOWN'); }
      await f.close(); checks++;
    }

    const expiry = await fixture(); await prepare(expiry.page); await ready(expiry.page);
    await expiry.page.clock.fastForward(61000); await state(expiry.page, 'EXPIRED');
    assert.equal(await expiry.page.locator('input[name="token"]').inputValue(), '');
    if (screenshotDir) await expiry.page.screenshot({ path: join(screenshotDir, 'download-360-expired.png'), fullPage: true });
    await expiry.page.getByRole('button', { name: 'إعادة تجهيز الرابط', exact: true }).click();
    await ready(expiry.page);
    assert.equal(expiry.calls.filter(c => c.path === '/api/downloads/requests').length, 1, 'An unexpired request renews its token without another admission');
    await expiry.close(); checks++;

    const duplicate = await fixture();
    await duplicate.page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).evaluate(n => { n.click(); n.click(); });
    await state(duplicate.page, 'COUNTDOWN'); await ready(duplicate.page);
    await duplicate.page.locator('form').evaluate(n => { n.requestSubmit(); n.requestSubmit(); });
    await state(duplicate.page, 'DOWNLOADING'); await duplicate.page.waitForTimeout(300);
    assert.equal(duplicate.calls.filter(c => c.path === '/api/downloads/requests').length, 1);
    assert.equal(duplicate.calls.filter(c => c.path === '/api/downloads/redeem').length, 1);
    await duplicate.close(); checks++;

    const reload = await fixture(); await prepare(reload.page); reload.setStatusOffset(10);
    await reload.page.reload({ waitUntil: 'domcontentloaded' }); await state(reload.page, 'COUNTDOWN');
    assert.equal(await reload.page.getByRole('timer').innerText(), '10\nثانية متبقية');
    assert.equal(reload.calls.filter(c => c.path === '/api/downloads/requests').length, 1);
    await reload.page.clock.fastForward(11000); await state(reload.page, 'READY');
    await reload.close(); checks++;

    const failure = await fixture(360, 'redeem-error'); await prepare(failure.page); await ready(failure.page);
    const popupPromise = failure.context.waitForEvent('page');
    await failure.page.getByRole('button', { name: 'تحميل الملف', exact: true }).click();
    const popup = await popupPromise;
    try { await popup.getByRole('heading', { name: 'انتظر 10 ثوانٍ' }).waitFor({ timeout: 5000 }); }
    catch (error) { console.error('Native error tab diagnostics', popup.url(), await popup.content(), failure.calls.map(c => ({ path: c.path, method: c.method }))); throw error; }
    await failure.page.clock.fastForward(3500); await state(failure.page, 'FAILED');
    assert.equal(failure.calls.filter(c => c.path === '/api/downloads/redeem').length, 1);
    assert.equal(await popup.getByRole('link').getAttribute('href'), '/');
    await failure.close(); checks++;

    const missing = await fixture(); await missing.page.goto(base + '/?unavailable=1');
    await missing.page.getByRole('heading', { name: 'التحميل المباشر غير متاح حاليًا', exact: true }).waitFor();
    assert.equal(missing.calls.length, 0); assert.equal(await missing.page.locator('main').getByRole('button').count(), 0);
    await noOverflow(missing.page); await missing.close(); checks++;

    const unavailable = await fixture(360, 'unavailable');
    await unavailable.page.getByRole('button', { name: 'تجهيز رابط التحميل', exact: true }).click(); await state(unavailable.page, 'FAILED');
    assert.match(await unavailable.page.locator('main').innerText(), /هذا الملف غير متاح/);
    await unavailable.close(); checks++;

    for (const width of [360, 768, 1440]) {
      const f = await fixture(width); await f.page.goto(base + '/?actions=1');
      const primary = f.page.locator('.detail-download'); await primary.waitFor();
      assert.equal(await primary.getAttribute('href'), '/download/201'); assert.equal(await primary.getAttribute('target'), null);
      await f.page.evaluate(() => window.scrollTo(0, 600));
      if (width < 1024) { await f.page.locator('.mobile-download-bar').waitFor({ state: 'visible' }); assert.equal(await f.page.locator('.mobile-download-bar a').getAttribute('href'), '/download/201'); }
      await noOverflow(f.page);
      await f.page.goto(base + '/?actions=1&unavailable=1'); await primary.waitFor();
      assert.equal(await primary.getAttribute('href'), 'https://example.test/legacy'); assert.equal(await primary.getAttribute('target'), '_blank');
      await f.close(); checks++;
    }
    console.log(`Download UI: ${checks} browser flows passed (360/768/1440px, keyboard, reduced motion, reload, expiry, retries, native POST).`);
  } finally { await browser.close(); }
}
