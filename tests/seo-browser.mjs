/** Browser DOM/soft-navigation SEO checks, only against disposable local fixtures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { base } = JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG, 'utf8'));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
assert.ok(process.env.WZ_BROWSER_MODULE, 'Set WZ_BROWSER_MODULE to isolated Playwright tooling.');
const { chromium } = await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser = await chromium.launch({ headless: true, ...(process.env.WZ_BROWSER_EXECUTABLE ? { executablePath: process.env.WZ_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox'] });
let checks = 0;
async function until(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('SEO browser state did not settle within 10 seconds.');
}
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [], network = [];
    page.on('request', request => network.push(`request ${request.method()} ${request.url()}`));
    page.on('response', response => network.push(`response ${response.status()} ${response.url()}`));
    page.on('requestfailed', request => network.push(`failed ${request.url()} ${request.failure()?.errorText}`));
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    for (const path of ['/', '/apps', '/games', '/about', '/privacy', '/apps/whatsapp-201']) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.locator('main h1').waitFor();
      await page.locator('.site-header:has(.search-dialog) .brand-link').waitFor();
      await until(async () => await page.locator('link[rel="canonical"]').getAttribute('href') === (path === '/' ? base : base + path));
      assert.equal(await page.locator('title').count(), 1);
      assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
      assert.equal(await page.locator('meta[name="description"]').count(), 1);
      assert.equal(await page.locator('main h1').count(), 1);
      assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), path === '/' ? base : base + path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px ${path}`);
      checks++;
    }
    // Directory navigation must replace app metadata with landing metadata.
    await page.locator('.site-header:has(.search-dialog) button.header-search').click();
    await page.locator('.search-dialog[open]').waitFor();
    await page.locator('.search-dialog button[aria-label="إغلاق البحث"]').click();
    await page.locator('.search-dialog[open]').waitFor({ state: 'hidden' });
    await page.locator('.detail-breadcrumbs').getByRole('link', { name: 'التطبيقات', exact: true }).click();
    // Assert the actual destination and its metadata after using the breadcrumb.
    try { await until(() => new URL(page.url()).pathname === '/apps'); }
    catch (error) { console.error('SEO navigation diagnostics:', { width, url: page.url(), errors, network: network.slice(-30), text: await page.locator('body').innerText() }); throw error; }
    await page.getByRole('heading', { name: 'تطبيقات وليد زون', exact: true }).waitFor();
    await until(async () => await page.locator('link[rel="canonical"]').getAttribute('href') === base + '/apps');
    assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
    assert.equal(await page.title(), 'تطبيقات وليد زون | Waleed Zone');
    assert.deepEqual(errors, []);
    checks++;
    if (process.env.WZ_SEO_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.WZ_SEO_SCREENSHOTS}/apps-${width}.png`, fullPage: true });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('#trending-title').waitFor();
      await page.locator('main .app-card').first().waitFor();
      await page.screenshot({ path: `${process.env.WZ_SEO_SCREENSHOTS}/home-${width}.png`, fullPage: true });
    }
    await page.close();
  }
  console.log(`SEO browser: ${checks} checks passed at 360/768/1440px, including directory navigation, single metadata/H1 and no horizontal overflow.`);
} finally { await browser.close(); }
