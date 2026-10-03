import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture,token} from './fixtures/admin-ui/api.mjs';
/** All Google requests are intercepted locally; fixture IDs are never sent to Google. */
export async function verifyMonetizationUI({base,root}) {
  const {chromium}=await import(pathToFileURL(process.env.WZ_BROWSER_MODULE).href);
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WZ_BROWSER_EXECUTABLE?{executablePath:process.env.WZ_BROWSER_EXECUTABLE}:{})});
  const output=join(root,'docs/screenshots/monetization');mkdirSync(output,{recursive:true});
  try {
    for(const width of [360,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'}),page=await context.newPage(),state=fixture(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      let row={application_id:201,name:'تطبيق مراجعة طويل للاختبار',icon:null,category:'تطبيقات',version:'1.0',active:true,published:true,status:'unreviewed',rights_basis:'unknown',review_notes:'',reviewed_at:null,revision:'a'.repeat(64)},failure=0,writes=0;
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==base)return route.abort();
        if(!url.pathname.startsWith('/api/admin/'))return route.continue();
        const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        const path=url.pathname;
        if(path.includes('/monetization')){
          if(failure&&(failure!==409||route.request().method()!=='GET'))return respond({error:{message:'PRIVATE_ERROR_DO_NOT_RENDER'}},failure);
          if(route.request().method()==='PUT'){
            assert.equal(route.request().headers()['x-csrf-token'],token);const input=route.request().postDataJSON();
            assert.deepEqual(Object.keys(input).sort(),['expected_revision','status','rights_basis','review_notes'].sort());
            assert.equal(input.expected_revision,row.revision);row={...row,...input,revision:(row.revision.startsWith('a')?'b':'a').repeat(64)};writes++;return respond(row);
          }
          if(path.endsWith('/201'))return respond(row);
          return respond({items:[row],next_after:null,counts:{eligible:row.status==='eligible'?1:0,unreviewed:row.status==='unreviewed'?1:0,blocked:row.status==='blocked'?1:0},gates:{publisherConfigured:false,contentReviewed:false,siteApproved:false,privacyReady:false,enabled:false,serving:false,manualPlacementConfigured:false}});
        }
        if(path.endsWith('/session'))return respond({csrf_token:token,expires_at:new Date(Date.now()+900000).toISOString()});
        if(path.endsWith('/status'))return respond(state.status);
        if(path.endsWith('/catalog'))return respond({items:state.applications,next_after:null});
        return respond({},404);
      });
      await page.goto(base+'/admin#monetization');await page.getByRole('heading',{name:'مراجعة أهلية الإعلانات'}).waitFor();
      await page.getByRole('button',{name:/تطبيق مراجعة طويل/}).click();
      assert.equal(await page.getByRole('button',{name:'تحديد كمؤهل'}).isDisabled(),true);
      await page.getByLabel('أساس الحقوق').selectOption('open_source');await page.getByLabel(/ملاحظات داخلية/).fill('https://license.example.test confirmed redistribution and reviewed page/destinations');
      await page.getByRole('button',{name:'تحديد كمؤهل'}).click();await page.getByText(/تم الحفظ وتأكيد المراجعة/).waitFor();assert.equal(row.status,'eligible');
      await page.getByRole('button',{name:'حظر الإعلانات'}).click();await page.getByText('الحالة الحالية: محظور',{exact:true}).waitFor();assert.equal(row.status,'blocked');
      await page.getByRole('button',{name:'حفظ كغير مراجع'}).click();await page.getByText('الحالة الحالية: غير مراجع',{exact:true}).waitFor();assert.equal(writes,3);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);
      assert.equal(await page.locator('input,select,textarea').evaluateAll(nodes=>nodes.filter(n=>!n.labels?.length&&!n.getAttribute('aria-label')).length),0);
      if(process.env.WZ_AXE_MODULE){await page.addScriptTag({path:process.env.WZ_AXE_MODULE});const result=await page.evaluate(async()=> (await window.axe.run('#main-content',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id));assert.deepEqual(result,[]);}
      await page.screenshot({path:join(output,`admin-${width}.png`),fullPage:true});
      failure=409;await page.getByRole('button',{name:'حظر الإعلانات'}).click();await page.getByText(/تعارض في النسخة/).waitFor();failure=0;
      await page.getByRole('button',{name:'تحديث مراجعات الربح'}).click();await page.getByRole('button',{name:/تطبيق مراجعة طويل/}).waitFor();
      failure=503;await page.getByRole('button',{name:'تحديث مراجعات الربح'}).click();await page.locator('#monetization-title').waitFor();await page.getByRole('alert').filter({hasText:/الخدمة/}).waitFor();
      assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_ERROR_DO_NOT_RENDER'));assert.equal(await page.getByRole('button',{name:'تحديد كمؤهل'}).count(),0);
      assert.deepEqual(errors,[]);await context.close();
    }
    const context=await browser.newContext(),page=await context.newPage();let requests=0;
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='pagead2.googlesyndication.com') {requests++;return route.fulfill({contentType:'text/javascript',body:'window.adsbygoogle=[];window.adsbygoogle.push=function(){window.__fixtureAdPush=(window.__fixtureAdPush||0)+1};'});}
      return url.origin===base?route.continue():route.abort();
    });
    await page.addInitScript(()=>{window.__fixtureDecision={cmpId:300,cmpStatus:'loaded',eventStatus:'tcloaded',tcString:'fixture-only-base64url-consent',purpose:{consents:{1:false,3:false,4:false}},vendor:{consents:{755:false}}};window.__tcfapi=(command,_version,cb)=>{if(command==='addEventListener'){window.__fixtureCallback=cb;cb(window.__fixtureDecision,true);}};});
    await page.goto(base+'/apps/privacy-test-201');await page.getByRole('heading',{name:'Consent test fixture'}).waitFor();assert.equal(requests,0);assert.equal(await page.locator('ins.adsbygoogle').count(),0);
    await page.waitForFunction(()=>Boolean(window.__fixtureCallback));
    await page.evaluate(()=>window.__fixtureCallback({...window.__fixtureDecision,purpose:{consents:{1:true,3:true,4:true}},vendor:{consents:{755:true}}},true));
    await page.waitForFunction(()=>window.__fixtureAdPush===1);assert.equal(requests,1);assert.equal(await page.locator('ins.adsbygoogle').count(),1);
    await page.evaluate(()=>window.__fixtureCallback(window.__fixtureDecision,true));await page.waitForFunction(()=>!document.querySelector('ins.adsbygoogle'));
    await page.goto(base+'/download/201');await page.getByRole('heading',{name:'Excluded download fixture'}).waitFor();assert.equal(requests,1);assert.equal(await page.locator('ins.adsbygoogle').count(),0);
    await context.close();console.log('Monetization UI: owner transitions, errors, 360/768/1440 layout, consent grant/deny/revoke, excluded download route passed. No live Google traffic.');
  } finally {await browser.close();}
}
