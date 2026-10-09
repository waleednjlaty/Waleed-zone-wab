import 'server-only';
import { chromium, type Browser, type Page, type BrowserContext, type LaunchOptions, type Response as BrowserResponse } from 'playwright';
import { BZZHR_HOSTS, BZZHR_FILE_HOSTS, signedDestination, signedEndpoints, validateBzzhrDns } from '../providers/bzzhr';
import { STEAMRIP_HOSTS } from '../providers/steamrip';
import { publicUrl, vettedAddresses, requireStageSuccess, providerError, ProviderFailure, type Lookup, type PublicHttp } from '../providers/public-http';
export const BROWSER_STATES=['BROWSER_STARTING','OPENING_SOURCE','FINDING_BZZHR','RESOLVING_DOWNLOAD','VERIFYING_FILE','READY','PROVIDER_CHALLENGE','FAILED'] as const;
export type BrowserState=typeof BROWSER_STATES[number];
const PAGE_HOSTS=[...STEAMRIP_HOSTS,...BZZHR_HOSTS];
// Only HTMX assets; never advertising, CAPTCHA, analytics or arbitrary CDN scripts.
import { BROWSER_ASSET_HOSTS as ASSET_HOSTS, installNativeNetwork, type NativeFixture } from './native-network';
const HOSTS=[...PAGE_HOSTS,...BZZHR_FILE_HOSTS,...ASSET_HOSTS];
export { stableBzzhr } from './policy';
import { stableBzzhr } from './policy';
export type BrowserInput={source:string;cached:string[]};
export type BrowserResult={destination:string;discovered:string[]};
type Options={signal:AbortSignal;progress:(state:BrowserState)=>void;lookup?:Lookup; launch?:(options:LaunchOptions)=>Promise<Browser>; http?:PublicHttp; fixture?:(context:BrowserContext)=>Promise<void>;nativeFixture?:NativeFixture};
/** Chromium uses native networking and cookies, with numerical DNS pins for this job.
 * No HTTP-resolver shortcut: navigation, JS and clicks execute inside the browser. */
export async function browserDestination(input:BrowserInput,options:Options):Promise<BrowserResult> {
  const source=publicUrl(input.source,PAGE_HOSTS);let browser:Browser|undefined,context:BrowserContext|undefined;
  let failure:unknown,stage:'steamrip'|'bzzhr_page'|'bzzhr_htmx'|'final_file'=STEAMRIP_HOSTS.includes(source.hostname as never)?'steamrip':'bzzhr_page';
  let discovered:string[]=[],destination:string|undefined,activeHost=source.hostname;
  const requestedEndpoints=new Set<string>();
  const authorizedEndpoints=new Set<string>();let authorizedDirect:string|undefined;
  const declaredProvider=(url:string)=>{
    try {const candidate=new URL(stableBzzhr(url));return discovered.some(page=>new URL(page).pathname.replace(/\/$/,'')===candidate.pathname.replace(/\/$/,''));}catch{return false;}
  };
  // Initial popup navigation has no Frame yet; bind its response by exact URL.
  const documents=new Map<string,BrowserResponse>();
  const stop=(error:unknown)=>{failure??=error;void context?.close().catch(()=>{});};
  const abort=()=>stop(providerError('PROVIDER_TIMEOUT'));
  options.signal.addEventListener('abort',abort,{once:true});
  try {
    options.signal.throwIfAborted();options.progress('BROWSER_STARTING');
    const pins=await Promise.all(HOSTS.map(async host=>{
      try {const rows=await vettedAddresses(host,options.signal,options.lookup),pin=rows.find(r=>r.family===4)||rows[0];return `MAP ${host} ${pin.family===6?'['+pin.address+']':pin.address}`;}
      catch(error){if(host===source.hostname)throw error;return '';}
    }));
    options.signal.throwIfAborted();
    try {browser=await (options.launch??(o=>chromium.launch(o)))({headless:true,timeout:8000,args:[
      '--disable-dev-shm-usage','--disable-background-networking','--disable-quic','--disable-features=DnsOverHttps,AsyncDns',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',`--host-resolver-rules=${pins.filter(Boolean).join(',')},MAP * ~NOTFOUND`,
    ]});}catch{throw providerError('BROWSER_START_FAILED');}
    options.signal.throwIfAborted();
    context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',permissions:[],viewport:{width:1024,height:768}});
    context.setDefaultTimeout(6000);context.setDefaultNavigationTimeout(8000);
    context.on('request',request=>requestedEndpoints.add(request.url()));
    await context.routeWebSocket('**/*',socket=>socket.close());
    if(options.fixture)await options.fixture(context);
    const main=await context.newPage();
    const root=await browser.newBrowserCDPSession();
    const existing=new Set((await root.send('Target.getTargets',{filter:[{type:'tab',exclude:false},{type:'page',exclude:false},{exclude:true}]})).targetInfos.map(target=>target.targetId));
    let popupTargets=0;
    root.on('Target.attachedToTarget',event=>{
      if(!existing.has(event.targetInfo.targetId)){
        if(++popupTargets>2)stop(providerError('BROWSER_REQUEST_LIMIT'));
        void root.send('Target.closeTarget',{targetId:event.targetInfo.targetId}).catch(()=>{});
      }
    });
    // Pause every newly created page/tab before it can fetch a popup redirect.
    // The declared anchor is still clicked; its approved target is followed in main.
    await root.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,
      filter:[{type:'tab',exclude:false},{type:'shared_worker',exclude:false},{type:'service_worker',exclude:false},{exclude:true}]});
    context.on('page',page=>{if(page!==main)void page.close().catch(()=>{});});
    await installNativeNetwork(context,main,{signal:options.signal,declared:declaredProvider,endpoints:authorizedEndpoints,
      direct:()=>authorizedDirect,destination:url=>{destination=url;},stop,fixture:options.nativeFixture});
    context.on('response',response=>{
      if(response.request().isNavigationRequest())documents.set(response.url(),response);
      void (async()=>{
      const request=response.request(),url=response.url();
      if(!request.isNavigationRequest()&&!['xhr','fetch'].includes(request.resourceType()))return;
      if(BZZHR_HOSTS.includes(new URL(url).hostname as never)&&!declaredProvider(url)&&!authorizedEndpoints.has(url))return;
      const headers=await response.allHeaders(),status=response.status();
      if(Number(headers['content-length']||0)>1048576)throw providerError('INVALID_PROVIDER_RESPONSE');
      const xhr=['xhr','fetch'].includes(request.resourceType());
      if(status===403||status===429||headers['cf-mitigated']==='challenge'
        ||(xhr&&![301,302,303,307,308].includes(status))) {
        const body=await response.text().catch(()=>'');requireStageSuccess({url,status,headers,body},stage);
      }
      const raw=headers['hx-redirect']||headers.location;
      if(raw&&authorizedEndpoints.has(url)) {
        const candidate=new URL(raw,url);
        if(BZZHR_FILE_HOSTS.includes(candidate.hostname as never)&&candidate.pathname.startsWith('/d/'))destination=signedDestination(raw,url);
        else if(headers['hx-redirect'])throw providerError('INVALID_SOURCE');
        else if(headers.location) {
          if(/[\s\p{Cc}\p{Cf}\\]/u.test(raw))throw providerError('INVALID_SOURCE');
          const next=publicUrl(candidate.href,BZZHR_HOSTS),id=new URL(url).pathname.split('/')[1];
          if(next.origin!==new URL(url).origin||!next.pathname.startsWith('/'+id+'/')||/(?:^|\/)(?:preview|delete|remove|login|account)(?:\/|$)/i.test(next.pathname))throw providerError('INVALID_SOURCE');
          authorizedEndpoints.add(next.href);
        }
      }
    })().catch(stop);});
    async function open(page:Page,url:string) {
      activeHost=new URL(url).hostname;
      const response=await page.goto(url,{waitUntil:'domcontentloaded'});
      if(!response)throw providerError();
      const html=await page.content();if(html.length>1048576)throw providerError('INVALID_PROVIDER_RESPONSE');
      requireStageSuccess({url:response.url(),status:response.status(),headers:await response.allHeaders(),body:html},stage);
    }
    let providerPage:Page=main;
    const cached=input.cached.slice(0,3).map(stableBzzhr);
    if(BZZHR_HOSTS.includes(source.hostname as never))discovered=[stableBzzhr(source.href)];
    else if(cached.length)discovered=cached;
    else {
      options.progress('OPENING_SOURCE');await open(main,source.href);options.progress('FINDING_BZZHR');
      // Anchor domain/path is decisive. CSS class names and scripts are not trusted.
      await main.locator('a[href]').first().waitFor({state:'attached'});
      const hrefs=await main.locator('a[href]').evaluateAll(nodes=>{
        const markers=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b'))
          .filter(node=>!node.closest('nav,aside,footer')&&/\bdownload\s+links?\b/i.test(node.textContent||''));
        const scopes=markers.map(marker=>{
          const root=marker.closest('article,main,section')||document.body;
          const level=Number(marker.tagName.slice(1))||2;
          const end=Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(node=>
            node!==marker&&!node.contains(marker)&&Number(node.tagName.slice(1))<=level&&Boolean(marker.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING));
          return {marker,root,end};
        });
        return nodes.slice(0,1000).filter(node=>!node.closest('nav,aside,footer')&&scopes.some(({marker,root,end})=>
          root.contains(node)&&Boolean(marker.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)
          &&(!end||Boolean(node.compareDocumentPosition(end)&Node.DOCUMENT_POSITION_FOLLOWING))))
          .map(node=>({href:(node as HTMLAnchorElement).href,raw:node.getAttribute('href')||'',text:node.textContent||''}));
      });
      for(const link of hrefs)try {if(/[\s\p{Cc}\p{Cf}\\]/u.test(link.raw)||/:[0-9]+$/.test(link.raw.split('/')[2]||''))continue;const url=stableBzzhr(link.href);if(!discovered.includes(url))discovered.push(url);if(discovered.length===3)break;}catch{/* other providers/ads */}
      if(!discovered.length)throw providerError('BZZHR_NOT_FOUND');
      stage='bzzhr_page';
      // Click the actual provider link; a download popup may be legitimate.
      const chosen=main.locator('a[href]').filter({hasText:/BZZHR|BuzzHeavier/i});
      const anchors=main.locator('a[href]');let clicked=false;
      for(let i=0;i<Math.min(await anchors.count(),1000);i++)if(await anchors.nth(i).evaluate(node=>(node as HTMLAnchorElement).href)===discovered[0]) {
        await (await chosen.count()&&await chosen.first().evaluate(node=>(node as HTMLAnchorElement).href)===discovered[0]?chosen.first():anchors.nth(i)).click({timeout:3000}).catch(error=>{
          // A closed/paused advertising popup may stall Playwright's click wait.
          // Never click again; continue only to the already declared source.
          if(error.name!=='TimeoutError'||failure||options.signal.aborted||main.isClosed())throw error;
        });clicked=true;break;
      }
      if(!clicked)throw providerError('BZZHR_NOT_FOUND');
      // Ad popup is closed by the context policy. A declared link can then be
      // opened in the original context without clicking the ad or its redirect.
      const pages=context.pages();providerPage=pages.find(p=>declaredProvider(p.url()))||main;
    }
    stage='bzzhr_page';options.progress('RESOLVING_DOWNLOAD');
    let html='';
    for(let i=0;i<discovered.length;i++) {
      try {
        if(i>0||!BZZHR_HOSTS.includes(new URL(providerPage.url()).hostname as never))await open(providerPage,discovered[i]);
        else await providerPage.waitForLoadState('domcontentloaded');
        if(!declaredProvider(providerPage.url()))throw providerError('INVALID_SOURCE');
        if(failure)throw failure;
        activeHost=new URL(providerPage.url()).hostname;
        html=await providerPage.content();const document=documents.get(providerPage.url());
        if(!document||html.length>1048576)throw providerError('INVALID_PROVIDER_RESPONSE');
        requireStageSuccess({url:providerPage.url(),status:document.status(),headers:await document.allHeaders(),body:html},stage);
        break;
      }catch(error) {
        // Only declared mirrors of this game; an access barrier stops all fan-out.
        if(failure||options.signal.aborted||i===discovered.length-1||!['SOURCE_REMOVED','PROVIDER_HTTP_ERROR'].includes((error as {code?:string})?.code||''))throw error;
      }
    }
    let endpoints:string[]=[];
    try {endpoints=signedEndpoints(html.replace(/\bdata-hx-get\s*=/gi,'hx-get='),providerPage.url());}catch{/* Explicit final attachment links are also supported below. */}
    const buttons=providerPage.locator('[hx-get],[data-hx-get],a[href]');let button,clickedEndpoint:string|undefined;
    let directFile=false;
    for(let i=0;i<Math.min(await buttons.count(),1000);i++) {
      const node=buttons.nth(i),raw=await node.getAttribute('hx-get')||await node.getAttribute('data-hx-get')||await node.getAttribute('href');
      if(raw&&endpoints.includes(new URL(raw,providerPage.url()).href)){button=node;clickedEndpoint=new URL(raw,providerPage.url()).href;authorizedEndpoints.add(clickedEndpoint);break;}
      if(raw&&!endpoints.length)try {
        authorizedDirect=signedDestination(raw,providerPage.url());button=node;directFile=true;break;
      }catch{/* unrelated links never become file destinations */}
    }
    if(!button)throw providerError('INVALID_PROVIDER_RESPONSE');
    if(clickedEndpoint)requestedEndpoints.delete(clickedEndpoint);
    stage='bzzhr_htmx';await button.click().catch(error=>{if(!destination)throw error;});
    if(directFile&&authorizedDirect)destination=authorizedDirect;
    // Prefer the real site's JS interaction. For a declarative endpoint without
    // installed HTMX, browser-native fetch uses this context's scoped cookie jar.
    if(!destination&&!failure&&!directFile) {
      const nativeHtmx=await providerPage.evaluate(()=>Boolean((window as unknown as {htmx?:unknown}).htmx));
      if(!nativeHtmx&&clickedEndpoint&&!requestedEndpoints.has(clickedEndpoint))await providerPage.evaluate(async endpoint=>{
        await fetch(endpoint,{credentials:'same-origin',headers:{'HX-Request':'true','HX-Current-URL':location.href},redirect:'manual'});
      },clickedEndpoint);
    }
    const until=Date.now()+5000;
    while(!destination&&!failure&&Date.now()<until&&!options.signal.aborted)await new Promise(r=>setTimeout(r,50));
    if(failure)throw failure;if(!destination)throw providerError('MISSING_HX_REDIRECT');
    stage='final_file';options.progress('VERIFYING_FILE');
    destination=await validateBzzhrDns(destination,options.signal,options.http);options.signal.throwIfAborted();
    options.progress('READY');return {destination,discovered};
  } catch(error) {
    const actual=failure||error;
    const wrapped=actual instanceof ProviderFailure?actual:new ProviderFailure((actual as {code?:string})?.code?actual as never:providerError(options.signal.aborted?'PROVIDER_TIMEOUT':'BROWSER_FAILED'),stage,activeHost);
    options.progress(wrapped.code==='PROVIDER_CHALLENGE'?'PROVIDER_CHALLENGE':'FAILED');throw wrapped;
  } finally {
    options.signal.removeEventListener('abort',abort);
    await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
  }
}
