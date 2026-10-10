import 'server-only';
import type { BrowserContext, Page } from 'playwright';
import { BZZHR_HOSTS, BZZHR_FILE_HOSTS, signedDestination } from '../providers/bzzhr';
import { STEAMRIP_HOSTS } from '../providers/steamrip';
import { publicUrl, providerError } from '../providers/public-http';
export const BROWSER_ASSET_HOSTS=['cdn.jsdelivr.net','cdnjs.cloudflare.com','unpkg.com'];
const PAGES=[...STEAMRIP_HOSTS,...BZZHR_HOSTS];
const HOSTS=[...PAGES,...BZZHR_FILE_HOSTS,...BROWSER_ASSET_HOSTS];
export type NativeRequest={url:string;method:string;headers:Record<string,string>};
export type NativeFixture=(request:NativeRequest)=>Promise<{status:number;headers?:Record<string,string>;body?:string}|undefined>;
type Policy={signal:AbortSignal;declared:(url:string)=>boolean;endpoints:Set<string>;direct:()=>string|undefined;
  destination:(url:string)=>void;stop:(error:unknown)=>void;fixture?:NativeFixture;
  requireDns?:(url:URL,resourceType:string)=>void};
/** CDP Fetch pauses EVERY native request, including each HTTP redirect. Ordinary
 * Playwright route handlers apply only to the first request in a redirect chain. */
export async function installNativeNetwork(context:BrowserContext,page:Page,policy:Policy) {
  const session=await context.newCDPSession(page);
  const {frameTree}=await session.send('Page.getFrameTree');
  session.on('Target.attachedToTarget',event=>{
    void session.send('Target.closeTarget',{targetId:event.targetInfo.targetId}).catch(()=>{});
  });
  await session.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,
    filter:[{type:'worker',exclude:false},{type:'shared_worker',exclude:false},{type:'service_worker',exclude:false},{exclude:true}]});
  const requestUrls=new Map<string,string>();let count=0;
  session.on('Fetch.requestPaused',event=>{
    void (async()=>{
      const blocked=()=>session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}).catch(()=>{});
      try {
        if(policy.signal.aborted)return await blocked();
        if(++count>100)throw providerError('BROWSER_REQUEST_LIMIT');
        const url=publicUrl(event.request.url,HOSTS);requestUrls.set(event.requestId,url.href);
        if(!['GET','HEAD'].includes(event.request.method))return await blocked();
        if(event.resourceType==='Document'&&event.frameId!==frameTree.frame.id)return await blocked();
        if(BZZHR_FILE_HOSTS.includes(url.hostname as never)&&url.pathname.startsWith('/d/')) {
          if(url.href===policy.direct())policy.destination(signedDestination(url.href,url.href));
          return await blocked(); // No game bytes, including native Location redirects.
        }
        const prior=event.redirectedRequestId&&requestUrls.get(event.redirectedRequestId);
        if(prior&&policy.endpoints.has(prior)) {
          const previous=new URL(prior),id=previous.pathname.split('/')[1];
          if(url.origin!==previous.origin||!url.pathname.startsWith('/'+id+'/')
            ||/(?:^|\/)(?:preview|delete|remove|login|account)(?:\/|$)/i.test(url.pathname))throw providerError('INVALID_PROVIDER_RESPONSE');
          policy.endpoints.add(url.href);
        }
        if(BROWSER_ASSET_HOSTS.includes(url.hostname)) {
          if(event.resourceType!=='Script'||!/^\/(?:npm\/)?htmx(?:\.org)?(?:@|\/)|^\/ajax\/libs\/htmx\//.test(url.pathname))return await blocked();
        } else if(!PAGES.includes(url.hostname as never))return await blocked();
        if(['Image','Media','Font','Stylesheet'].includes(event.resourceType))return await blocked();
        if(BZZHR_HOSTS.includes(url.hostname as never)) {
          if(event.resourceType==='Document'&&!policy.declared(url.href)&&!policy.endpoints.has(url.href))throw providerError('INVALID_SOURCE');
          if(['XHR','Fetch'].includes(event.resourceType)&&!policy.endpoints.has(url.href))return await blocked();
        }
        // Optional-host lookup failures must stay failures. Never allow Chromium
        // to retry an unpinned name or mislabel its resolver error as a page error.
        policy.requireDns?.(url,event.resourceType);
        // Tests supply native response fixtures only after the production policy.
        // This hook is absent from worker IPC and never enabled by environment.
        const headers=Object.fromEntries(Object.entries(event.request.headers).map(([k,v])=>[k.toLowerCase(),String(v)]));
        const mock=await policy.fixture?.({url:url.href,method:event.request.method,headers});
        if(mock) {
          await session.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:mock.status,
            responseHeaders:Object.entries(mock.headers||{}).map(([name,value])=>({name,value})),body:Buffer.from(mock.body||'').toString('base64')});
          return;
        }
        delete headers.authorization;delete headers.cookie;
        const cookies=(await context.cookies(url.href)).filter(cookie=>cookie.domain.replace(/^\./,'')===url.hostname);
        if(cookies.length)headers.cookie=cookies.map(cookie=>cookie.name+'='+cookie.value).join('; ');
        if((headers.cookie||'').length>2048)throw providerError('INVALID_PROVIDER_RESPONSE');
        if(headers.referer&&new URL(headers.referer).origin!==url.origin)delete headers.referer;
        await session.send('Fetch.continueRequest',{requestId:event.requestId,
          headers:Object.entries(headers).filter(([name])=>!name.startsWith(':')).map(([name,value])=>({name,value}))});
      } catch(error) {
        // Unrelated subresource hosts are blocked, never promoted to a source.
        if((error as {code?:string})?.code!=='INVALID_SOURCE'||(event.resourceType==='Document'&&event.frameId===frameTree.frame.id))policy.stop(error);
        await blocked();
      }
    })().catch(policy.stop);
  });
  await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
}
