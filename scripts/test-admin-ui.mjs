/** Disposable frontend fixture. No owner impersonation in production, DB or cloud. */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const folder = mkdtempSync(join(tmpdir(), 'wz-admin-ui-'));
const port = Number(process.env.WZ_ADMIN_UI_PORT || 3102);
const base = `http://127.0.0.1:${port}`;
let server;
try {
  assert.ok(process.env.WZ_BROWSER_MODULE, 'Set WZ_BROWSER_MODULE to your existing Playwright index.mjs.');
  mkdirSync(join(folder, 'src/app/admin'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'), 'dir');
  for (const path of ['src/components', 'src/lib', 'src/data', 'public']) cpSync(join(root, path), join(folder, path), { recursive: true });
  for (const name of ['tsconfig.json', 'next.config.js', 'postcss.config.js', 'tailwind.config.ts', 'package.json']) cpSync(join(root, name), join(folder, name));
  cpSync(join(root, 'src/app/globals.css'), join(folder, 'src/app/globals.css'));
  for(const path of ['terms','copyright','contact','privacy','about'])cpSync(join(root,'src/app',path),join(folder,'src/app',path),{recursive:true});
  cpSync(join(root, 'tests/fixtures/admin-ui/page.tsx'), join(folder, 'src/app/admin/page.tsx'));
  writeFileSync(join(folder, 'src/app/page.tsx'), 'export default function Page(){return <a href="/admin">Admin UI fixture</a>}');
  writeFileSync(join(folder, 'src/app/layout.tsx'), `import './globals.css';import Brand from '@/components/Brand';import Footer from '@/components/Footer';export default function Layout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><header className="site-header"><div className="shell header-inner"><a href="/" className="brand-link"><Brand/></a></div></header><main id="main-content">{children}</main><Footer/></body></html>}`);
  mkdirSync(join(folder, 'src/app/apps/privacy-test-201'), { recursive: true });
  mkdirSync(join(folder, 'src/app/download/201'), { recursive: true });
  // Use the real middleware/CSP only for consent fixtures; all IDs stay network-isolated.
  const middleware = readFileSync(join(root, 'src/middleware.ts'), 'utf8');
  assert.ok(middleware.includes("matcher:['/((?!_next/static|_next/image|favicon.ico).*)']"));
  writeFileSync(join(folder, 'src/middleware.ts'), middleware.replace("matcher:['/((?!_next/static|_next/image|favicon.ico).*)']", "matcher:['/apps/privacy-test-201','/download/201']"));
  const manualFixture = `import {headers} from 'next/headers';import ManualAd from '@/components/monetization/ManualAd';export default async function Page(){const nonce=(await headers()).get('x-nonce')||undefined;return <><h1>Consent test fixture</h1><ManualAd publisherId="ca-pub-0000000000000000" slotId="0000000000" cmpId={300} nonce={nonce} path="/apps/privacy-test-201"/></>}`;
  writeFileSync(join(folder,'src/app/apps/privacy-test-201/page.tsx'),manualFixture);
  writeFileSync(join(folder,'src/app/download/201/page.tsx'),manualFixture.replace('Consent test fixture','Excluded download fixture'));
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: folder, env: { ...process.env, DATABASE_URL: '', ADSENSE_PUBLISHER_ID:'ca-pub-0000000000000000', ADSENSE_CONTENT_REVIEWED:'true', ADSENSE_SITE_APPROVED:'true', ADSENSE_PRIVACY_READY:'true', ADSENSE_ENABLED:'true', ADSENSE_DETAIL_SLOT_ID:'0000000000', ADSENSE_CMP_ID:'300', NEXT_PUBLIC_SITE_URL: base, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'inherit', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, 'Fixture server stopped.');
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Fixture server did not start.');
  if (process.env.WZ_AGENT_BROWSER) {
    for (const args of [['open', base], ['snapshot', '-i'], ['eval', 'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : "OK"'], ['close']]) {
      const code = await new Promise(resolve => spawn(process.env.WZ_AGENT_BROWSER, args, { env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: process.env.WZ_BROWSER_EXECUTABLE || '' }, stdio: 'inherit' }).on('exit', resolve));
      assert.equal(code, 0, 'agent-browser verification failed.');
    }
  }
  const { verifyAdminUI } = await import(pathToFileURL(join(root, 'tests/admin-browser.mjs')).href);
  await verifyAdminUI({ base, root });
  const {verifyMonetizationUI}=await import(pathToFileURL(join(root,'tests/monetization-browser.mjs')).href);
  await verifyMonetizationUI({base,root});
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended;
  }
  rmSync(folder, { recursive: true, force: true });
}
