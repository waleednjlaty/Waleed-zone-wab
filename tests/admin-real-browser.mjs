/** Real owner dashboard forms: no route mocks, fake responses or cloud traffic. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8'));
const base=config.base;
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'https:');
const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
let checks=0;
const versionId='11111111-1111-4111-8111-111111111111';
const secrets=[...config.secrets,config.ownerCookie.split('=')[1],config.userCookie.split('=')[1],config.statsToken];
try{
 for(const width of [360,768,1440]){
  const context=await browser.newContext({viewport:{width,height:960},ignoreHTTPSErrors:true,reducedMotion:'reduce'});
  const external=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort('blockedbyclient');});
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/api/admin/')&&r.method()!=='GET')writes.push(r);});
  for(const [actor,cookie] of [['anonymous',''],['non-owner',config.userCookie],['expired',config.expiredCookie]]){
   await context.clearCookies();
   if(cookie){const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);}
   const response=await page.goto(base+'/admin');
   await page.getByRole('heading',{name:/الصفحة مو موجودة|This page could not be found\./}).waitFor();
   const html=await page.content();assert.ok([200,404].includes(response.status()));assert.ok(html.includes('الصفحة مو موجودة'));assert.ok(!html.includes('OWNER CONSOLE'));
   assert.match(response.headers()['cache-control'],/no-store/);assert.match(response.headers()['x-robots-tag'],/noindex/);
   assert.ok(!(await page.content()).includes('OWNER CONSOLE'));checks++;
  }
  await context.clearCookies();const [name,value]=config.ownerCookie.split('=');await context.addCookies([{name,value,url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await page.goto(base+'/admin');await page.getByText('جداول التحميل',{exact:true}).waitFor();
  const nav=async label=>{await page.getByRole('navigation',{name:'أقسام لوحة المالك'}).getByRole('link',{name:label}).click();};
  const confirmed=()=>page.getByText('تم الحفظ وتأكيد الحالة الجديدة من الخادم.',{exact:true}).waitFor();
  const inspect=async()=>{
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width}`);
   assert.equal(await page.locator('input:not([type=hidden]),select').evaluateAll(nodes=>nodes.filter(n=>!n.labels?.length&&!n.getAttribute('aria-label')).length),0);
   const html=await page.content();for(const secret of secrets)assert.ok(!html.includes(secret));
   assert.ok(!/X-Amz-(Signature|Credential)|QA_PRIVATE_STORAGE|password_hash|token_hash/.test(html));
   assert.deepEqual(errors,[]);checks++;
  };
  await inspect();await nav('التطبيقات');await page.getByRole('button',{name:'إدارة WhatsApp',exact:true}).click();
  await page.getByRole('form',{name:'إعداد التحميل'}).waitFor();
  assert.equal(await page.getByLabel('وضع التحميل',{exact:true}).locator('option[value="direct"]').isDisabled(),true);
  assert.equal(await page.getByLabel('الإصدار الحالي',{exact:true}).isDisabled(),true);
  await page.getByLabel('وضع التحميل',{exact:true}).selectOption('disabled');await page.getByRole('button',{name:'حفظ إعداد التطبيق',exact:true}).click();await confirmed();await inspect();
  // Simulate another valid tab publishing a config change; UI must refetch on 409 with no retry.
  const session=await context.request.get(base+'/api/admin/session');assert.equal(session.status(),200);const {csrf_token}=await session.json();
  const current=await context.request.get(base+'/api/admin/downloads/config/201').then(r=>r.json());
  const competing=await context.request.put(base+'/api/admin/downloads/config/201',{headers:{Origin:base,'X-CSRF-Token':csrf_token},data:{expected_revision:current.revision,mode:'legacy',current_version_id:null}});assert.equal(competing.status(),200);
  const beforeWrites=writes.length;await page.getByRole('button',{name:'حفظ إعداد التطبيق',exact:true}).click();
  await page.getByText(/تعارض في الحفظ\. أُعيدت قراءة الحالة/).waitFor();
  await page.waitForFunction(()=>document.querySelector('form[aria-label="إعداد التحميل"] select')?.value==='legacy');
  assert.equal(writes.length,beforeWrites+1,'Stale write must not retry');await inspect();
  await nav('الإصدارات');await page.getByLabel('اسم الإصدار',{exact:true}).fill(`new-${width}`);await page.getByLabel('مفتاح الإصدار (release_key)',{exact:true}).fill(`qa-${width}`);
  await page.getByRole('button',{name:'إنشاء إصدار pending',exact:true}).click();await confirmed();
  const versions=await context.request.get(base+'/api/admin/downloads/versions?application_id=201').then(r=>r.json());
  const draft=versions.items.find(v=>v.release_key===`qa-${width}`);assert.equal(draft.active,false);assert.equal(draft.published,false);
  await page.getByLabel('الإصدار المراد تحريره',{exact:true}).selectOption(draft.id);
  await page.getByLabel('اسم الإصدار',{exact:true}).fill(`renamed-${width}`);await page.getByRole('button',{name:'تنفيذ إجراء الإصدار',exact:true}).click();await confirmed();
  await nav('الملفات');
  const form=page.getByRole('form',{name:'بيانات ملف جديد'}),fileId=randomUUID();
  await form.getByLabel('UUID الملف',{exact:true}).fill(fileId);await form.getByLabel('الإصدار',{exact:true}).selectOption(draft.id);
  await form.getByLabel('اسم ملف التنزيل',{exact:true}).fill(`new-${width}.apk`);await form.getByLabel('الحجم بالبايت',{exact:true}).fill('48');await form.getByLabel('SHA-256',{exact:true}).fill('b'.repeat(64));
  await form.getByText('مرجع التخزين الخاص · metadata فقط',{exact:true}).click();await form.getByLabel('مفتاح الكائن (storage_key)',{exact:true}).fill(`artifacts/${fileId}/${'b'.repeat(64)}.apk`);
  await form.getByRole('button',{name:'إنشاء metadata بحالة pending',exact:true}).click();await confirmed();
  const created=await context.request.get(base+'/api/admin/downloads/files/'+fileId).then(r=>r.json());assert.equal(created.scan_status,'pending');assert.equal(created.active,false);
  assert.ok(!('sha256' in created));assert.ok(!('storage_key' in created));
  const pending=page.getByRole('listitem').filter({hasText:`new-${width}.apk`});assert.equal(await pending.getByRole('button',{name:'تفعيل الملف',exact:true}).isDisabled(),true);await inspect();
  // Actual independently verified fixture file: staged file/version activation, publication and withdrawal.
  let record=page.getByRole('listitem').filter({hasText:'qa.apk'});
  await record.getByRole('button',{name:'تفعيل الملف',exact:true}).click();await confirmed();
  await nav('الإصدارات');await page.getByLabel('الإصدار المراد تحريره',{exact:true}).selectOption(versionId);
  await page.getByLabel('إجراء الإصدار',{exact:true}).selectOption('activate');await page.getByRole('button',{name:'تنفيذ إجراء الإصدار',exact:true}).click();await confirmed();
  await page.getByLabel('الإصدار المراد تحريره',{exact:true}).selectOption(versionId);await page.getByLabel('إجراء الإصدار',{exact:true}).selectOption('publish');await page.getByRole('button',{name:'تنفيذ إجراء الإصدار',exact:true}).click();await confirmed();
  await page.getByLabel('الإصدار المراد تحريره',{exact:true}).selectOption(versionId);await page.getByLabel('إجراء الإصدار',{exact:true}).selectOption('withdraw');await page.getByRole('button',{name:'تنفيذ إجراء الإصدار',exact:true}).click();await confirmed();await inspect();
  await nav('الملفات');record=page.getByRole('listitem').filter({hasText:'qa.apk'});await record.getByRole('button',{name:'إلغاء تفعيل الملف',exact:true}).click();await confirmed();
  await nav('حالة النظام');await page.getByText(/9,007,199,254,740,993 bytes/).waitFor();await inspect();
  await nav('الإيقاف العام');
  if(width===360){assert.equal(await page.getByRole('button',{name:'إيقاف التحميل المباشر',exact:true}).isDisabled(),true);await page.getByLabel('أؤكد إيقاف التحميل المباشر لجميع التطبيقات.',{exact:true}).check();await page.getByRole('button',{name:'إيقاف التحميل المباشر',exact:true}).click();await confirmed();}
  await page.getByText('مفتاح الإيقاف مفعّل',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'إيقاف التحميل المباشر',exact:true}).isDisabled(),true);await inspect();
  await page.getByRole('navigation',{name:'أقسام لوحة المالك'}).getByRole('link',{name:/نظرة عامة/}).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.tagName==='H2');
  assert.deepEqual(external,[]);await context.close();
 }
 console.log(`Real Admin HTTPS/PostgreSQL browser: ${checks} checks passed at 360/768/1440; pending/create/rename/staged actions/stale conflict/kill switch, no mocks.`);
}finally{await browser.close();}
