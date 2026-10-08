import 'server-only';
import { createHash } from 'node:crypto';
import { firstHtmlAttribute } from './html';
import { publicHttp,publicUrl,providerError,providerStage,requireStageSuccess,type PublicHttp } from './public-http';
import { BZZHR_HOSTS, resolveBzzhr } from './bzzhr';
export const STEAMRIP_HOSTS=['steamrip.com','www.steamrip.com'] as const;
export function steamripBzzhr(html: string, base: string) {
  publicUrl(base,STEAMRIP_HOSTS);
  const found=firstHtmlAttribute(html,'href',(value,tag)=>{
    if(tag!=='a')return;
    try {if(/[\s\p{Cc}\p{Cf}\\]/u.test(value))return;
      const url=publicUrl(new URL(value,base).href,BZZHR_HOSTS);
      if(/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))return url.href;
    }catch{/* Other hosting providers remain unsupported by this resolver. */}
  });
  if(found)return found;
  throw providerError('BZZHR_NOT_FOUND');
}
export async function steamripDestination(source: string, signal: AbortSignal, http: PublicHttp=publicHttp) {
  publicUrl(source,[...STEAMRIP_HOSTS,...BZZHR_HOSTS]);
  if(BZZHR_HOSTS.includes(new URL(source).hostname as typeof BZZHR_HOSTS[number])) {
    publicUrl(source,BZZHR_HOSTS);return resolveBzzhr(source,signal,http);
  }
  publicUrl(source,STEAMRIP_HOSTS);
  const page=await providerStage('steamrip',source,()=>http(source,STEAMRIP_HOSTS,signal));requireStageSuccess(page,'steamrip');
  const bzzhr=await providerStage('steamrip',page.url,async()=>steamripBzzhr(page.body,page.url));
  return resolveBzzhr(bzzhr,signal,http);
}
/** At most two active resolutions, no queue and no completed signed-URL cache. Key binds app, revision and source. */
export function createSteamripResolver(resolve=steamripDestination,validate: (destination:string,signal:AbortSignal)=>Promise<void>=async()=>{},now=Date.now) {
  const inFlight=new Map<string,Promise<string>>();let circuitUntil=0;
  return async (applicationId: number, revision: string, source: string):Promise<string> => {
    const key=createHash('sha256').update(JSON.stringify([applicationId,revision,source])).digest('hex');
    const existing=inFlight.get(key);if(existing)return existing;
    if(inFlight.size>=2 || now()<circuitUntil)throw providerError('PROVIDER_BUSY');
    const operation=(async()=>{
      const signal=AbortSignal.timeout(25000);
      try {const destination=await resolve(source,signal);await validate(destination,signal);return destination;}
      catch(error){circuitUntil=now()+10000;throw error;}
      finally{inFlight.delete(key);}
    })();
    inFlight.set(key,operation);return operation;
  };
}
export const resolveSteamrip=createSteamripResolver();
