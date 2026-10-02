import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, versionId, fileId, token } from './fixtures/admin-ui/api.mjs';

export async function verifyAdminUI({ base, root }) {
  const { chromium } = await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.WZ_BROWSER_EXECUTABLE ? { executablePath: process.env.WZ_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox'] });
  const screenshots = join(root, 'docs/screenshots/admin-ui'); mkdirSync(screenshots, { recursive: true });
  let checks = 0;
  try {
    for (const width of [360, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = fixture(), writes = [];
      let failure = 0, slow = false, failConfirmation = false, readCount = 0;
      await page.route('**/api/admin/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (failure) return respond({ error: { message: 'DO_NOT_RENDER_ERROR_SECRET' } }, failure);
        if (request.method() !== 'GET') {
          assert.equal(request.headers()['x-csrf-token'], token); const input = request.postDataJSON(); writes.push([path, input]);
          if (path.endsWith('/control')) { assert.deepEqual(input, { enabled: false }); state.status.enabled = false; }
          else if (path.endsWith('/config/201')) { state.detail.application.mode = input.mode; state.detail.application.current_version_id = input.current_version_id; }
          else if (path.endsWith('/versions')) state.detail.versions.push({ ...input, id: '33333333-3333-4333-8333-333333333333' });
          else if (path.endsWith('/files')) state.detail.files.push({ ...input, id: '44444444-4444-4444-8444-444444444444', scan_status: 'pending', active: false, retired_at: null });
          return respond({ ok: true });
        }
        if (failConfirmation && writes.length) return respond({}, 503);
        if (slow && path.endsWith('/202')) await new Promise(resolve => setTimeout(resolve, 800));
        if (path.endsWith('/csrf')) return respond({ csrf_token: token });
        if (path.endsWith('/status')) { readCount++; return respond(state.status); }
        if (path.endsWith('/applications')) return respond({ applications: state.applications, total: state.applications.length });
        if (path.endsWith('/201')) return respond(state.detail);
        if (path.endsWith('/202')) return respond({ application: state.applications[1], versions: [], files: [], blockers: ['DIRECT_ACTIVATION_BLOCKED'], direct_activation_allowed: false });
        return respond({}, 404);
      });
      const navigate = async name => { await page.getByRole('navigation', { name: 'أقسام لوحة المالك' }).getByRole('link', { name, exact: false }).click(); };
      const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}px`);
      const accessibility = async () => {
        if (!process.env.WZ_AXE_MODULE) return;
        await page.addScriptTag({ path: process.env.WZ_AXE_MODULE });
        const result = await page.evaluate(async () => (await window.axe.run('#main-content', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
        assert.deepEqual(result, [], `Accessibility violations at ${width}px`);
      };
      await page.goto(`${base}/admin`); await page.getByText('جداول التحميل', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-nextjs-dialog]').count(), 0); await noOverflow();
      await accessibility(); await page.screenshot({ path: join(screenshots, `admin-${width}-overview.png`), fullPage: true }); checks++;
      await navigate('التطبيقات'); await page.getByRole('button', { name: 'إدارة WZ Test App', exact: true }).click();
      await page.getByRole('form', { name: 'إعداد التحميل' }).waitFor();
      assert.equal(await page.getByLabel('وضع التحميل', { exact: true }).locator('option[value="direct"]').isDisabled(), true);
      assert.ok(await page.getByText('عوائق تفعيل direct', { exact: true }).isVisible());
      assert.ok(!(await page.locator('body').innerText()).includes('DO_NOT_RENDER'));
      await noOverflow(); await accessibility(); await page.screenshot({ path: join(screenshots, `admin-${width}-configuration.png`), fullPage: true }); checks++;
      // Same-origin config save and authoritative reread.
      await page.getByLabel('وضع التحميل', { exact: true }).selectOption('disabled');
      await page.getByRole('button', { name: 'حفظ إعداد التطبيق', exact: true }).click();
      await page.getByText('تم الحفظ وتأكيد الحالة الجديدة من الخادم.', { exact: true }).waitFor();
      assert.equal(state.detail.application.mode, 'disabled'); assert.ok(readCount >= 2); checks++;
      await navigate('الإصدارات');
      assert.equal(await page.getByLabel('active · إصدار فعّال', { exact: true }).isDisabled(), true);
      await page.getByLabel('اسم الإصدار', { exact: true }).fill('2.0.0');
      await page.getByLabel('مفتاح الإصدار (release_key)', { exact: true }).fill('2.0.0-r1');
      await page.getByRole('button', { name: 'إنشاء إصدار pending', exact: true }).click();
      await page.getByRole('heading', { name: 'الإصدارات المسجّلة' }).waitFor();
      await page.getByRole('list').filter({ hasText: '2.0.0' }).waitFor();
      assert.equal(state.detail.versions[1].active, false); assert.equal(state.detail.versions[1].published, false);
      await noOverflow(); checks++;
      await navigate('الملفات');
      await page.getByRole('form', { name: 'بيانات ملف جديد' }).getByLabel('الإصدار', { exact: true }).selectOption(versionId);
      await page.getByLabel('اسم ملف التنزيل', { exact: true }).fill('new-1.0.0.apk');
      await page.getByLabel('الحجم بالبايت', { exact: true }).fill('48');
      await page.getByLabel('SHA-256', { exact: true }).fill('z'.repeat(64));
      await page.getByText('مرجع التخزين الخاص · metadata فقط', { exact: true }).click();
      await page.getByLabel('مفتاح الكائن (storage_key)', { exact: true }).fill(`artifacts/${fileId}/${'a'.repeat(64)}.apk`);
      await page.getByRole('button', { name: 'إنشاء metadata بحالة pending', exact: true }).click();
      await page.getByText('SHA-256 يجب أن يتألف من 64 حرفًا سداسيًا صغيرًا.', { exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alert');
      await page.getByLabel('SHA-256', { exact: true }).fill('a'.repeat(64));
      await page.getByRole('button', { name: 'إنشاء metadata بحالة pending', exact: true }).click();
      await page.getByRole('list').filter({ hasText: 'new-1.0.0.apk' }).waitFor();
      assert.equal(state.detail.files[1].scan_status, 'pending'); assert.equal(state.detail.files[1].active, false);
      await noOverflow(); await accessibility(); await page.screenshot({ path: join(screenshots, `admin-${width}-files.png`), fullPage: true }); checks++;
      // Focus and labels: all editable controls have accessible labels.
      assert.equal(await page.locator('input:not([type=hidden]),select').evaluateAll(nodes => nodes.filter(n => !n.labels?.length && !n.getAttribute('aria-label')).length), 0);
      await page.getByRole('navigation', { name: 'أقسام لوحة المالك' }).getByRole('link', { name: /حالة النظام/ }).focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.tagName === 'H2');
      assert.equal(await page.getByRole('heading', { name: 'حالة النظام', exact: true }).evaluate(n => n === document.activeElement), true);
      await noOverflow(); checks++;
      // Stale app responses cannot populate a newer selection.
      await navigate('إعداد التحميل'); slow = true;
      await page.getByLabel('اختيار تطبيق من الصفحة الحالية', { exact: true }).selectOption('202');
      await page.getByLabel('اختيار تطبيق من الصفحة الحالية', { exact: true }).selectOption('201');
      await page.getByRole('form', { name: 'إعداد التحميل' }).waitFor();
      await page.waitForTimeout(900);
      assert.equal(await page.getByLabel('وضع التحميل', { exact: true }).inputValue(), 'disabled'); checks++;
      // Kill switch has confirmation, never enables downloads.
      state.status.enabled = true; state.status.deployment_enabled = true;
      await page.getByRole('button', { name: 'تحديث الحالة', exact: true }).click();
      await page.getByRole('form', { name: 'إعداد التحميل' }).waitFor();
      await navigate('الإيقاف العام');
      await page.getByText('مفتاح الإيقاف غير مفعّل', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'إيقاف التحميل المباشر', exact: true }).isDisabled(), true);
      await page.getByLabel('أؤكد إيقاف التحميل المباشر لجميع التطبيقات.', { exact: true }).check();
      await page.getByRole('button', { name: 'إيقاف التحميل المباشر', exact: true }).click();
      await page.getByText('مفتاح الإيقاف مفعّل', { exact: true }).waitFor();
      assert.equal(state.status.enabled, false); checks++;
      // A successful write with failed reread is NOT a confirmed success.
      await navigate('إعداد التحميل'); await page.getByLabel('وضع التحميل', { exact: true }).selectOption('legacy');
      failConfirmation = true;
      await page.getByRole('button', { name: 'حفظ إعداد التطبيق', exact: true }).click();
      await page.getByText(/استلم الخادم الحفظ، لكن تعذر تأكيد الحالة الجديدة/).waitFor();
      assert.equal(await page.getByText('تم الحفظ وتأكيد الحالة الجديدة من الخادم.', { exact: true }).count(), 0); checks++;
      failConfirmation = false;
      for (const status of [401, 403, 404, 409, 429, 503]) {
        failure = status; await page.getByRole('button', { name: 'تحديث الحالة', exact: true }).click();
        await page.getByText('عمليات الحفظ محظورة', { exact: true }).waitFor();
        assert.equal(await page.getByRole('form', { name: 'إعداد التحميل' }).count(), 0);
        assert.ok(!(await page.locator('body').innerText()).includes('DO_NOT_RENDER_ERROR_SECRET')); checks++;
      }
      await noOverflow(); await page.screenshot({ path: join(screenshots, `admin-${width}-unavailable.png`), fullPage: true });
      failure = 0; state.applications = [];
      await page.getByRole('button', { name: 'تحديث الحالة', exact: true }).click(); await navigate('التطبيقات');
      await page.getByText('لا توجد تطبيقات في هذه الصفحة', { exact: true }).waitFor(); checks++;
      assert.deepEqual(errors, [], `Browser errors at ${width}px`);
      await context.close();
    }
    console.log(`Admin UI: ${checks} checks passed at 360/768/1440px; screenshots in docs/screenshots/admin-ui.`);
  } finally { await browser.close(); }
}
