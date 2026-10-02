/** Isolated frontend harness. No DB, production API, cloud or artifact transfer. */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const folder = mkdtempSync(join(tmpdir(), 'wz-download-ui-'));
const port = Number(process.env.WZ_DOWNLOAD_UI_PORT || 3101);
const base = `http://127.0.0.1:${port}`;
let server;
try {
  assert.ok(process.env.WZ_BROWSER_MODULE, 'Set WZ_BROWSER_MODULE to your existing Playwright index.mjs.');
  mkdirSync(join(folder, 'src/app'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'), 'dir');
  cpSync(join(root, 'src/components'), join(folder, 'src/components'), { recursive: true });
  cpSync(join(root, 'src/lib'), join(folder, 'src/lib'), { recursive: true });
  cpSync(join(root, 'src/data'), join(folder, 'src/data'), { recursive: true });
  cpSync(join(root, 'public'), join(folder, 'public'), { recursive: true });
  cpSync(join(root, 'src/app/globals.css'), join(folder, 'src/app/globals.css'));
  cpSync(join(root, 'tests/fixtures/download-ui/page.tsx'), join(folder, 'src/app/page.tsx'));
  for (const name of ['tsconfig.json', 'next.config.js', 'postcss.config.js', 'tailwind.config.ts', 'package.json']) cpSync(join(root, name), join(folder, name));
  writeFileSync(join(folder, 'public/qa-download.txt'), 'Disposable QA fixture: no APK bytes.');
  appendFileSync(join(folder, 'next.config.js'), `\nconst fixtureHeaders=module.exports.headers;module.exports={...module.exports,devIndicators:false,async headers(){return [...await fixtureHeaders(),{source:'/qa-download.txt',headers:[{key:'Content-Disposition',value:'attachment; filename="qa-download.txt"'}]}]}};\n`);
  writeFileSync(join(folder, 'src/app/layout.tsx'), `import './globals.css';import Brand from '@/components/Brand';import Footer from '@/components/Footer';export default function Layout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><header className="site-header"><div className="shell header-inner"><Brand/></div></header><main id="main-content">{children}</main><Footer/></body></html>}`);
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: folder, env: { ...process.env, DATABASE_URL: '', NEXT_PUBLIC_SITE_URL: base }, stdio: ['ignore', 'inherit', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, 'Fixture server stopped.');
    try { if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Fixture server did not start.');
  if (process.env.WZ_AGENT_BROWSER) {
    // Also verify the dev surface with agent-browser when installed.
    for (const args of [['open', base], ['snapshot', '-i'], ['eval', 'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : "OK"'], ['close']]) {
      const code = await new Promise(resolve => spawn(process.env.WZ_AGENT_BROWSER, args, { env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: process.env.WZ_BROWSER_EXECUTABLE || '' }, stdio: 'inherit' }).on('exit', resolve));
      assert.equal(code, 0, 'agent-browser verification failed.');
    }
  }
  const { verifyDownloadUI } = await import(pathToFileURL(join(root, 'tests/download-browser.mjs')).href);
  await verifyDownloadUI({ base, root });
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended;
  }
  rmSync(folder, { recursive: true, force: true });
}
