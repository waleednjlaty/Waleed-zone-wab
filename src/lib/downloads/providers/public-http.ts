import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { DownloadError } from '../rules';

export const providerError = (code = 'PROVIDER_UNAVAILABLE') => new DownloadError(503, code, new Date(Date.now() + 10000));
export type ProviderStage = 'steamrip' | 'bzzhr_page' | 'bzzhr_htmx' | 'final_file';
export class ProviderFailure extends DownloadError {
  constructor(error: DownloadError, public stage: ProviderStage, public host: string, public upstreamStatus?: number) {
    super(error.status,error.code,error.retryAt,error.serverTime);
  }
}
/** Only finite host/stage/status metadata leaves this boundary; never raw URLs/errors. */
export async function providerStage<T>(stage: ProviderStage, raw: string, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch(error) {
    if(error instanceof ProviderFailure)throw error;
    throw new ProviderFailure(error instanceof DownloadError?error:providerError(),stage,new URL(raw).hostname);
  }
}
export function publicUrl(raw: string, hosts: readonly string[]): URL {
  if (!raw || raw.length > 4096 || /[\s\p{Cc}\p{Cf}\\]/u.test(raw) || raw.includes('#')) throw providerError('INVALID_SOURCE');
  let url: URL; try { url = new URL(raw); } catch { throw providerError('INVALID_SOURCE'); }
  // Reject explicit ports, including :443 normalized away by WHATWG URL.
  if (url.protocol !== 'https:' || url.username || url.password || /:[0-9]+$/.test(raw.split('/')[2] || '')
    || !hosts.includes(url.hostname) || isIP(url.hostname)) throw providerError('INVALID_SOURCE');
  return url;
}
export function globalAddress(value: string): boolean {
  if (isIP(value) === 4) {
    const n = value.split('.').reduce((sum, part) => sum * 256 + Number(part), 0);
    const blocked: [string, number][] = [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
      ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],
      ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]];
    return !blocked.some(([base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(base.split('.').reduce((s,p)=>s*256+Number(p),0) / 2 ** (32 - bits)));
  }
  if (isIP(value) !== 6 || value.includes('%')) return false;
  const canonical = new URL(`https://[${value}]/`).hostname.slice(1,-1);
  const [left,right=''] = canonical.split('::'), a=left?left.split(':'):[], b=right?right.split(':'):[];
  const words=(canonical.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a).map(v=>parseInt(v,16));
  // Only native global unicast. Deny mapped, NAT64, 6to4, Teredo and special/documentation ranges.
  return (words[0] & 0xe000) === 0x2000 && !(words[0]===0x2001 && words[1]<0x200)
    && !(words[0]===0x2001 && words[1]===0xdb8) && words[0]!==0x2002
    && !(words[0]===0x3fff && words[1]<0x1000);
}
export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;
export async function vettedAddresses(host: string, signal: AbortSignal, lookup: Lookup = h=>dnsLookup(h,{all:true,verbatim:true})) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (()=>void) | undefined;
  try {
    const rows = await Promise.race([lookup(host), new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>reject(providerError('PROVIDER_TIMEOUT')),3000);
      abort=()=>reject(providerError('PROVIDER_TIMEOUT')); signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted) abort();
    })]);
    if (!rows.length || rows.some(row=>!globalAddress(row.address) || row.family!==isIP(row.address))) throw providerError('INVALID_SOURCE');
    return rows;
  } catch(error) { throw error instanceof DownloadError?error:providerError('PROVIDER_DNS_FAILED'); }
  finally { clearTimeout(timer); if(abort)signal.removeEventListener('abort',abort); }
}
export type ProviderCookie = { host:string; path:string; pair:string; expires:number };
export function cookieHeader(cookies: ProviderCookie[], raw: string) {
  const url=new URL(raw);
  return cookies.filter(c=>c.host===url.hostname && c.expires>Date.now() &&
    (url.pathname===c.path || url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).map(c=>c.pair).join('; ');
}
function receiveCookies(jar: ProviderCookie[], raw: string, rows: string[]) {
  const url=new URL(raw);
  for(const row of rows) {
    if(row.length>4096 || /[\r\n\x00]/.test(row))throw providerError('INVALID_PROVIDER_RESPONSE');
    const [pair,...attributes]=row.split(';'),separator=pair.indexOf('=');
    if(separator<1 || !/^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/.test(pair.slice(0,separator)))continue;
    let path=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1)||'/',expires=Infinity,domain=url.hostname;
    for(const attribute of attributes){const [key,...parts]=attribute.trim().split('='),value=parts.join('=');
      if(key.toLowerCase()==='path'&&value.startsWith('/'))path=value;
      if(key.toLowerCase()==='domain')domain=value.toLowerCase().replace(/^\./,'');
      if(key.toLowerCase()==='max-age'&&/^-?\d+$/.test(value))expires=Date.now()+Number(value)*1000;
      if(key.toLowerCase()==='expires'&&Number.isFinite(Date.parse(value))&&expires===Infinity)expires=Date.parse(value);
    }
    if(domain!==url.hostname && !url.hostname.endsWith('.'+domain))continue;
    const index=jar.findIndex(c=>c.host===url.hostname&&c.path===path&&c.pair.split('=')[0]===pair.slice(0,separator));
    if(index>=0)jar.splice(index,1);
    if(expires>Date.now())jar.push({host:url.hostname,path,pair,expires});
    if(jar.length>20 || jar.reduce((size,c)=>size+c.pair.length,0)>2048)throw providerError('INVALID_PROVIDER_RESPONSE');
  }
}
export type PublicResponse = { status: number; headers: Record<string,string>; body: string; url: string; cookies?:ProviderCookie[] };
export type PublicHttp = (url: string, hosts: readonly string[], signal: AbortSignal, headers?: Record<string,string>, follow?: boolean, method?: 'GET' | 'HEAD' | 'GET_HEADERS') => Promise<PublicResponse>;
/** One fresh, TLS-verified socket pinned to vetted DNS. No environment proxy, pooled socket or second DNS lookup. */
export const publicHttp: PublicHttp = async (raw,hosts,signal,headers={},follow=true,method='GET') => {
  let url=publicUrl(raw,hosts);
  const visited=new Set<string>();
  const jar:ProviderCookie[]=[];
  const scope=AbortSignal.any([signal,AbortSignal.timeout(10000)]);
  for(let redirects=0;redirects<=3;redirects++) {
    if(visited.has(url.href))throw providerError('PROVIDER_REDIRECT_LOOP');visited.add(url.href);
    const addresses=await vettedAddresses(url.hostname,scope), pin=addresses.find(address=>address.family===4)||addresses[0];
    const current=url.href;
    const session=cookieHeader(jar,current);
    const result=await new Promise<PublicResponse>((resolve,reject)=>{
      let connected=false;
      const req=httpsRequest(url,{method:method==='GET_HEADERS'?'GET':method,agent:false,rejectUnauthorized:true,family:pin.family,signal:scope,headers:{'Accept-Encoding':'identity','User-Agent':'WaleedZone/1.0',...headers,...(session?{Cookie:session}:{})},
        lookup:((_host: unknown,_options: unknown,callback: (error: null,address: string,family: number)=>void)=>callback(null,pin.address,pin.family)) as never}, res=>{
        clearTimeout(headerTimer);
        const h:Record<string,string>={};for(const [k,v] of Object.entries(res.headers))if(v!==undefined)h[k]=Array.isArray(v)?v.map(value=>k==='set-cookie'?value.split(';')[0]:value).join('; '):v;
        const status=res.statusCode||0;
        try {receiveCookies(jar,current,typeof res.headers['set-cookie']==='string'?[res.headers['set-cookie']]:res.headers['set-cookie']||[]);}catch(error){res.destroy();reject(error);return;}
        // Redirect/header-only HTMX responses never read a file body.
        if ((method==='HEAD'||method==='GET_HEADERS') || h['hx-redirect'] || [301,302,303,307,308].includes(status)) {res.destroy();resolve({status,headers:h,body:'',url:current});return;}
        if(Number(h['content-length']||0)>1048576 || (h['content-encoding']&&h['content-encoding']!=='identity')) {res.destroy();reject(providerError('INVALID_PROVIDER_RESPONSE'));return;}
        const chunks:Buffer[]=[];let bytes=0;
        res.setTimeout(4000,()=>res.destroy(providerError('PROVIDER_TIMEOUT')));
        res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1048576)res.destroy(providerError('INVALID_PROVIDER_RESPONSE'));else chunks.push(chunk);});
        res.on('end',()=>resolve({status,headers:h,body:Buffer.concat(chunks).toString('utf8'),url:current}));
        res.on('error',error=>reject(error instanceof DownloadError?error:providerError('PROVIDER_UNAVAILABLE')));
      });
      const connectTimer=setTimeout(()=>{if(!connected)req.destroy(providerError('PROVIDER_TIMEOUT'));},4000);
      const headerTimer=setTimeout(()=>req.destroy(providerError('PROVIDER_TIMEOUT')),6000);
      req.on('socket',socket=>socket.once('secureConnect',()=>{connected=true;clearTimeout(connectTimer);}));
      req.on('error',error=>reject(error instanceof DownloadError?error:providerError(scope.aborted?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE')));
      req.on('close',()=>{clearTimeout(connectTimer);clearTimeout(headerTimer);});req.end();
    });
    if(follow && [301,302,303,307,308].includes(result.status)) {
      if(!result.headers.location || /[\s\p{Cc}\p{Cf}\\]/u.test(result.headers.location))throw providerError('INVALID_PROVIDER_RESPONSE');
      if(redirects===3)throw providerError('PROVIDER_REDIRECT_LIMIT');
      const next=publicUrl(new URL(result.headers.location,current).href,hosts);
      if(next.hostname!==url.hostname)headers=Object.fromEntries(Object.entries(headers).filter(([key])=>!['cookie','authorization','referer','hx-current-url'].includes(key.toLowerCase())));
      url=next;continue;
    }
    return {...result,cookies:jar};
  }
  throw providerError('INVALID_PROVIDER_RESPONSE');
};
export function requireProviderSuccess(result: PublicResponse) {
  if (result.headers['cf-mitigated']==='challenge' || /cf-chl-|challenge-platform|<[^>]+(?:id|class)=["'][^"']*(?:challenge-form|cf-turnstile)|<title[^>]*>\s*just a moment|verify you are human/i.test(result.body)) throw providerError('PROVIDER_CHALLENGE');
  if(result.status===404 || result.status===410)throw new DownloadError(404,'SOURCE_REMOVED');
  if(result.status===401)throw providerError('PROVIDER_AUTH_REQUIRED');
  if(result.status===403)throw providerError('PROVIDER_FORBIDDEN');
  if(result.status===429)throw providerError('PROVIDER_RATE_LIMITED');
  if(result.status>=500)throw providerError('PROVIDER_HTTP_ERROR');
  if(![200,204,206].includes(result.status))throw providerError();
}
export function requireStageSuccess(result: PublicResponse, stage: ProviderStage) {
  try { requireProviderSuccess(result); } catch(error) {
    throw new ProviderFailure(error as DownloadError,stage,new URL(result.url).hostname,result.status);
  }
}
