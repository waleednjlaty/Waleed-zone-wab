import 'server-only';
import { publicHttp, publicUrl, providerError, requireProviderSuccess, vettedAddresses, type PublicHttp } from './public-http';
export const BZZHR_HOSTS=['bzzhr.to','bzzhr.co','buzzheavier.com','www.bzzhr.to','www.bzzhr.co','www.buzzheavier.com'] as const;
// Exact separate CDN evidenced by the existing bot test_hx_redirect_direct_download_is_accepted fixture.
export const BZZHR_FILE_HOSTS=[...BZZHR_HOSTS,'fafda.to'] as const;
export function htmlAttribute(value: string) {
  return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,hex,dec)=>String.fromCodePoint(parseInt(hex||dec,hex?16:10)));
}
export function signedEndpoint(html: string, page: string) {
  const base=publicUrl(page,BZZHR_HOSTS);
  for(const tag of html.matchAll(/<[a-z][^>]{0,8192}>/gi)) {
    const attr=tag[0].match(/\bhx-get\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(!attr)continue;
    try {
      const url=publicUrl(new URL(htmlAttribute(attr[1]??attr[2]),base).href,BZZHR_HOSTS);
      if(url.hostname===base.hostname && url.pathname===base.pathname.replace(/\/$/,'')+'/download' && url.searchParams.get('t'))return url.href;
    }catch{/* malformed endpoints fail closed */}
  }
  throw providerError('INVALID_PROVIDER_RESPONSE');
}
export function signedDestination(raw: string, base: string) {
  // Validate raw headers before URL normalization can discard CR/LF or whitespace.
  if(/[\s\p{Cc}\p{Cf}\\]/u.test(raw)||raw.includes('#'))throw providerError('INVALID_PROVIDER_RESPONSE');
  const url=publicUrl(new URL(raw,base).href,BZZHR_FILE_HOSTS);
  if(!/^\/d\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.%()-]+)*$/.test(url.pathname) || !url.searchParams.get('v')
    || url.searchParams.getAll('v').length!==1 || /[\r\n\x00]/.test(decodeURIComponent(url.search))) throw providerError('INVALID_PROVIDER_RESPONSE');
  return url.href;
}
export async function resolveBzzhr(page: string, signal: AbortSignal, http: PublicHttp=publicHttp) {
  publicUrl(page,BZZHR_HOSTS);
  const result=await http(page,BZZHR_HOSTS,signal);requireProviderSuccess(result);
  const endpoint=signedEndpoint(result.body,result.url);
  const response=await http(endpoint,BZZHR_HOSTS,signal,{'HX-Request':'true','HX-Current-URL':result.url,Referer:result.url},false);
  if(![200,204,302,303].includes(response.status))requireProviderSuccess(response);
  const raw=response.headers['hx-redirect']||response.headers.location;if(!raw)throw providerError('INVALID_PROVIDER_RESPONSE');
  return signedDestination(raw,endpoint);
}
export async function validateBzzhrDns(destination: string, signal: AbortSignal) {
  const url=publicUrl(destination,BZZHR_FILE_HOSTS);await vettedAddresses(url.hostname,signal);
}
