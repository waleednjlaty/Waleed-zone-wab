'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 let browser;
 try {
  browser=await chromium.launch({headless:true,timeout:8000,args:['--disable-dev-shm-usage','--disable-background-networking','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND']});
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  const page=await context.newPage();
  await page.goto('data:text/html,<title>Isolated browser smoke</title><script>window.qa=6*7</script>',{timeout:8000});
  assert.equal(await page.evaluate(()=>window.qa),42);
  await context.close();await browser.close();assert.equal(browser.isConnected(),false);
  console.log(JSON.stringify({area:'browser_smoke',status:'PASS',javascript:true,context_closed:true,browser_closed:true,scope:'DATA_PAGE_ONLY'}));
 }finally{await browser?.close();}
})().catch(()=>{console.error(JSON.stringify({area:'browser_smoke',status:'FAIL',code:'BROWSER_SMOKE_FAILED'}));process.exitCode=1;});
