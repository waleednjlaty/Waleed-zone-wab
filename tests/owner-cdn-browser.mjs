/** Android-sized acceptance against real HTTPS Next handlers and disposable PostgreSQL.
 * Only the CDN transport is a finite authorized 38-byte fixture; never a live game.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const config = JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG, 'utf8')), base = config.base;
assert.equal(new URL(base).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.WZ_BROWSER_EXECUTABLE ? { executablePath: process.env.WZ_BROWSER_EXECUTABLE } : {}) });
const body = 'Authorized tiny Waleed Zone CDN fixture';
let checks = 0;
try {
  for (const locale of ['ar', 'en']) {
    const en = locale === 'en';
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', ignoreHTTPSErrors: true, acceptDownloads: true });
    const [name, value] = config.ownerCookie.split('=');
    await context.addCookies([{ name, value, url: base, secure: true, httpOnly: true, sameSite: 'Lax' }, { name: 'wz_locale', value: locale, url: base }]);
    let cdnRequests = 0;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      assert.equal(url.hostname, 'ts.bzzhr.to'); assert.equal(url.pathname, '/d/file-xyz');
      assert.equal(route.request().method(), 'GET'); cdnRequests++;
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="owner-qa.txt"' }, body });
    });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin/download-test?application_id=210');
    await page.getByRole('button', { name: en ? 'Load source' : 'تحميل بيانات المصدر', exact: true }).click();
    await page.getByLabel(en ? 'Signed URL from Copy download link' : 'الرابط الموقّع من Copy download link', { exact: true }).fill('https://ts.bzzhr.to/d/file-xyz?v=' + (en ? 'QA_OWNER_HEAD_BLOCKED' : 'QA_OWNER_BROWSER_SECRET'));
    await page.getByLabel(en ? 'I confirm this file belongs to the selected game and its current version.' : 'أؤكد أن الملف يخص اللعبة المحددة وإصدارها الحالي.', { exact: true }).check();
    if (en) await page.getByLabel('Allow an owner test when HEAD is blocked. This exception is unavailable to visitors.', { exact: true }).check();
    const response = page.waitForResponse(r => r.url() === base + '/api/admin/downloads/cdn-test' && r.request().method() === 'POST');
    await page.getByRole('button', { name: en ? 'Save test link' : 'حفظ رابط الاختبار', exact: true }).click();
    const saved = await response; assert.equal(saved.status(), 200); assert.ok(!(await saved.text()).includes('QA_OWNER_')); checks++;
    await page.getByText(en ? 'Not server verified · owner test only' : 'تم التحقق خادميًا · اختبار مالك', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); checks++;
    mkdirSync('tests/screenshots', { recursive: true }); await page.screenshot({ path: `tests/screenshots/owner-cdn-${locale}-360.png`, fullPage: true });
    await page.getByRole('link', { name: en ? /Open normal download page/ : /فتح صفحة التحميل الطبيعية/ }).click();
    const preparation = page.waitForResponse(r => r.url() === base + '/api/downloads/legacy/prepare');
    await page.getByRole('button', { name: en ? 'Prepare download link' : 'تجهيز رابط التحميل', exact: true }).click();
    const prepared = await (await preparation).json();
    const nativeGrant = !en ? await (await context.request.post(base + '/api/downloads/legacy/prepare', { data: { application_id: 210 }, headers: { Origin: base } })).json() : null;
    await page.locator('[data-download-state="COUNTDOWN"]').waitFor();
    const fields = {application_id:'210', token:prepared.token};
    assert.ok(!JSON.stringify(prepared).includes('QA_OWNER_'));
    const early = await context.request.post(base + '/api/downloads/legacy/redeem', { form: fields, headers: { Origin: base }, maxRedirects: 0 });
    assert.equal(early.status(), 425); assert.equal(cdnRequests, 0); checks++;
    assert.equal(await page.locator('[class*="skeleton"]').count(), 0);
    const button = page.getByRole('button', { name: en ? 'Start download ↓' : 'بدء التحميل ↓', exact: true });
    await button.waitFor({ timeout: 26000 });
    const redeem = page.waitForResponse(r => r.url() === base + '/api/downloads/legacy/redeem'), download = page.waitForEvent('download');
    await button.click();
    const redirected = await redeem; assert.equal(redirected.status(), 200); assert.equal(new URL((await redirected.json()).destination).hostname, 'ts.bzzhr.to'); checks++;
    const file = await download; assert.equal(file.suggestedFilename(), 'owner-qa.txt'); assert.equal(await file.failure(), null);
    assert.equal(readFileSync(await file.path(), 'utf8'), body); assert.equal(cdnRequests, 1); assert.equal(page.url(), base + '/download/210'); assert.equal(context.pages().length, 1); checks++;
    const replay = await context.request.post(base + '/api/downloads/legacy/redeem', { form: fields, headers: { Origin: base }, maxRedirects: 0 }); assert.equal(replay.status(), 410); checks++;
    if (nativeGrant) {
      // Native fallback needs the download document's CSP. A Next client
      // navigation retains the original admin document's form-action policy.
      const documentResponse = await page.reload();
      assert.ok(documentResponse.headers()['content-security-policy'].split('; ').find(d => d.startsWith('form-action ')).split(' ').includes('https://ts.bzzhr.to'));
      // Playwright route() intercepts only the first request in a redirect
      // chain. CDP Fetch covers the genuine 303 -> CDN GET hop as well.
      await context.unroute('**/*');
      const nativeSession = await context.newCDPSession(page);
      nativeSession.on('Fetch.requestPaused', async ({requestId,request}) => {
        const url = new URL(request.url);
        if (url.origin === base) return nativeSession.send('Fetch.continueRequest', {requestId});
        assert.equal(url.hostname, 'ts.bzzhr.to'); assert.equal(url.pathname, '/d/file-xyz'); assert.equal(request.method, 'GET'); cdnRequests++;
        await nativeSession.send('Fetch.fulfillRequest', {requestId,responseCode:200,responseHeaders:[
          {name:'Content-Type',value:'application/octet-stream'}, {name:'Content-Disposition',value:'attachment; filename="owner-qa.txt"'},
        ],body:Buffer.from(body).toString('base64')});
      });
      await nativeSession.send('Fetch.enable', {patterns:[{urlPattern:'*',requestStage:'Request'}]});
      const remaining = Date.parse(nativeGrant.ready_at) - Date.now() + 100;
      if (remaining > 0) await page.waitForTimeout(remaining);
      const nativeResponse = page.waitForResponse(r => r.url() === base + '/api/downloads/legacy/redeem' && r.request().method() === 'POST');
      const nativeDownload = page.waitForEvent('download');
      await page.evaluate(token => {
        const form = document.createElement('form'); form.method = 'POST'; form.action = '/api/downloads/legacy/redeem';
        for (const [name, value] of Object.entries({application_id:'210',token})) {
          const field = document.createElement('input'); field.type = 'hidden'; field.name = name; field.value = value; form.append(field);
        }
        const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Start native QA download'; form.append(button);
        document.body.append(form);
      }, nativeGrant.token);
      await page.getByRole('button', {name:'Start native QA download',exact:true}).click();
      const nativeRedirect = await nativeResponse; assert.equal(nativeRedirect.status(), 303);
      assert.equal(new URL(nativeRedirect.headers().location).hostname, 'ts.bzzhr.to'); checks++;
      const nativeFile = await nativeDownload; assert.equal(await nativeFile.failure(), null);
      assert.equal(readFileSync(await nativeFile.path(), 'utf8'), body); assert.equal(cdnRequests, 2); assert.equal(context.pages().length, 1); checks++;
      await nativeSession.send('Fetch.disable'); await nativeSession.detach();
    }
    const visitor = await browser.newContext({ ignoreHTTPSErrors: true }); const [vn, vv] = config.userCookie.split('='); await visitor.addCookies([{ name: vn, value: vv, url: base }]);
    const denied = await visitor.request.get(base + '/api/admin/downloads/cdn-test?application_id=210'); assert.equal(denied.status(), 403);
    const ordinary = await visitor.request.post(base + '/api/downloads/legacy/prepare', { data: { application_id: 210 }, headers: { Origin: base } }); assert.equal(ordinary.status(), 200); assert.ok(!(await ordinary.text()).includes('owner_test')); checks++;
    assert.deepEqual(errors, []); await visitor.close(); await context.close();
  }
  console.log(`Owner CDN acceptance: ${checks} checks passed on Chrome Android 360px, Arabic/English, verified + explicit HEAD-blocked mode; fixture bytes reached browser directly, one-use replay denied.`);
} finally { await browser.close(); }
