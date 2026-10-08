import 'server-only';
import { htmlAttributes } from './html';
import { publicHttp, publicUrl, providerError, providerStage, requireStageSuccess, cookieHeader, type PublicHttp } from './public-http';
export const BZZHR_HOSTS=['bzzhr.to','bzzhr.co','buzzheavier.com','www.bzzhr.to','www.bzzhr.co','www.buzzheavier.com'] as const;
// Exact CDN hosts observed on owner-created live canaries, 2026-10-08.
// Keep exact hosts: provider HTML cannot expand the SSRF allowlist.
export const BZZHR_FILE_HOSTS=[...BZZHR_HOSTS,'fafda.to','ts.bzzhr.co','ts.buzzheavier.com'] as const;
export function signedEndpoints(html: string, page: string) {
  const base=publicUrl(page,BZZHR_HOSTS);
  const found=htmlAttributes(html,'hx-get',value=>{
    try {
      if(/[\s\p{Cc}\p{Cf}\\]/u.test(value))return;
      const url=publicUrl(new URL(value,base).href,BZZHR_HOSTS);
      // Use the supplied endpoint, never construct /download. Bind to the file ID,
      // but accept alternate server paths and query names on this same origin.
      const id=base.pathname.split('/').filter(Boolean)[0];
      if(id && url.hostname===base.hostname && url.pathname.startsWith('/'+id+'/')
        && !/(?:^|\/)(?:preview|delete|remove|login|account)(?:\/|$)/i.test(url.pathname))return url.href;
    }catch{/* malformed endpoints fail closed */}
  });
  if(found.length)return found;
  throw providerError('INVALID_PROVIDER_RESPONSE');
}
export function signedEndpoint(html: string,page: string) {return signedEndpoints(html,page)[0];}
export function signedDestination(raw: string, base: string) {
  // Validate raw headers before URL normalization can discard CR/LF or whitespace.
  if(/[\s\p{Cc}\p{Cf}\\]/u.test(raw)||raw.includes('#'))throw providerError('INVALID_PROVIDER_RESPONSE');
  const url=publicUrl(new URL(raw,base).href,BZZHR_FILE_HOSTS);
  let decoded: string;try{decoded=decodeURIComponent(url.pathname+url.search);}catch{throw providerError('INVALID_PROVIDER_RESPONSE');}
  if(!/^\/d\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.%()-]+)*$/.test(url.pathname) || !url.searchParams.get('v')
    || url.searchParams.getAll('v').length!==1 || /[\p{Cc}\p{Cf}\\]/u.test(decoded)) throw providerError('INVALID_PROVIDER_RESPONSE');
  return url.href;
}
export async function resolveBzzhr(page: string, signal: AbortSignal, http: PublicHttp=publicHttp) {
  publicUrl(page,BZZHR_HOSTS);
  const result=await providerStage('bzzhr_page',page,()=>http(page,BZZHR_HOSTS,signal));requireStageSuccess(result,'bzzhr_page');
  const endpoints=await providerStage('bzzhr_page',result.url,async()=>signedEndpoints(result.body,result.url));
  const fallbackCookie=result.headers['set-cookie'];
  const cookie=result.cookies?cookieHeader(result.cookies,endpoints[0]):fallbackCookie;
  if(cookie && (cookie.length>2048 || /[\r\n\x00]/.test(cookie)))throw providerError('INVALID_PROVIDER_RESPONSE');
  let lastError: unknown;
  for(const endpoint of endpoints)try {return await providerStage('bzzhr_htmx',endpoint,async()=>{
    const session=result.cookies?cookieHeader(result.cookies,endpoint):cookie;
    const response=await http(endpoint,BZZHR_HOSTS,signal,{'HX-Request':'true','HX-Current-URL':result.url,Referer:result.url,...(session?{Cookie:session}: {})},false);
    if(![301,302,303,307,308].includes(response.status))requireStageSuccess(response,'bzzhr_htmx');
    const raw=response.headers['hx-redirect']||response.headers.location;if(!raw)throw providerError('MISSING_HX_REDIRECT');
    const destination=signedDestination(raw,endpoint);
    return validateBzzhrDns(destination,signal,http);
  });}catch(error){
    lastError=error;
    // Alternate buttons are public provider-declared mirrors, not challenge bypass.
    if(signal.aborted || (error && typeof error==='object' && 'code' in error &&
      ['PROVIDER_CHALLENGE','PROVIDER_AUTH_REQUIRED','PROVIDER_RATE_LIMITED','INVALID_SOURCE'].includes(String(error.code))))throw error;
  }
  throw lastError;
}
export async function validateBzzhrDns(destination: string, signal: AbortSignal, http: PublicHttp=publicHttp) {
  publicUrl(destination,BZZHR_FILE_HOSTS);
  // Header-only request: never relay/download file bytes through Railway.
  return providerStage('final_file',destination,async()=>{
    let result=await http(destination,BZZHR_FILE_HOSTS,signal,{},true,'HEAD');
    if([405,501].includes(result.status))result=await http(destination,BZZHR_FILE_HOSTS,signal,{Range:'bytes=0-0'},true,'GET_HEADERS');
    requireStageSuccess(result,'final_file');
    if(![200,206].includes(result.status))throw providerError('INVALID_FILE_RESPONSE');
    const type=result.headers['content-type']||'';
    if(/(?:text\/html|application\/(?:xhtml\+xml|json))/i.test(type))throw providerError('INVALID_FILE_RESPONSE');
    if(!type && !result.headers['content-disposition'])throw providerError('INVALID_FILE_RESPONSE');
    return signedDestination(result.url,destination);
  });
}
