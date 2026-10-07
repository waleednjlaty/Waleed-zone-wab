import 'server-only';
import { createHash } from 'node:crypto';
import { firstHtmlAttribute } from './html';
import { publicHttp,publicUrl,providerError,requireProviderSuccess,type PublicHttp } from './public-http';
import { BZZHR_HOSTS, resolveBzzhr, validateBzzhrDns } from './bzzhr';
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
  publicUrl(source,STEAMRIP_HOSTS);
  const page=await http(source,STEAMRIP_HOSTS,signal);requireProviderSuccess(page);
  return resolveBzzhr(steamripBzzhr(page.body,page.url),signal,http);
}
/** At most two active resolutions, no queue and no completed signed-URL cache. Key binds app, revision and source. */
export function createSteamripResolver(resolve=steamripDestination,validate=validateBzzhrDns,now=Date.now) {
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
