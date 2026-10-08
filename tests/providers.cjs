'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),{readFileSync}=require('node:fs');
require('./helpers/typescript.cjs');
const load=Module._load;Module._load=function(name,...args){return name==='server-only'?{}:load.call(this,name,...args);};
const http=require('../src/lib/downloads/providers/public-http.ts');
const bzzhr=require('../src/lib/downloads/providers/bzzhr.ts');
const steam=require('../src/lib/downloads/providers/steamrip.ts');
Module._load=load;
const source='https://steamrip.com/qa-game/',page='https://bzzhr.to/file-xyz',endpoint=page+'/download?t=fixture-endpoint&sig=123',destination='https://fafda.to/d/file-xyz?v=fixture-signed-token';
const steamHtml=readFileSync('tests/fixtures/providers/steamrip.html','utf8'),bzzhrHtml=readFileSync('tests/fixtures/providers/bzzhr.html','utf8');
const signal=()=>AbortSignal.timeout(2000);
const error=code=>e=>e.code===code;
function fixture(change={}){const calls=[];const fn=async(url,hosts,sig,headers,follow,method)=>{
 calls.push({url,hosts,headers,follow,method});http.publicUrl(url,hosts);assert.equal(sig.aborted,false);
 if(url===destination)return {status:200,headers:{'content-type':'application/octet-stream'},body:'',url};
 if(change.fail)throw http.providerError(change.fail);
 if(url===source)return {status:200,headers:{},body:change.steam??steamHtml,url};
 if(url===page)return {status:change.status??200,headers:{},body:change.body??bzzhrHtml,url};
 assert.equal(url,endpoint);return {status:change.endpointStatus??200,headers:change.headers??{'hx-redirect':destination},body:'',url};
 };return {fn,calls};}
test('real fixture parsing resolves fresh signed endpoint and exact destination',async()=>{const f=fixture();assert.equal(await steam.steamripDestination(source,signal(),f.fn),destination);assert.equal(f.calls.length,4);assert.equal(f.calls[2].follow,false);assert.equal(f.calls[2].headers['HX-Request'],'true');});
for(const [name,change,code] of [
 ['no BZZHR',{steam:'<a href="https://evil.test/bzzhr">BZZHR</a>'},'BZZHR_NOT_FOUND'],
 ['missing signed endpoint',{body:'<a href="/file-xyz/download">no hx</a>'},'INVALID_PROVIDER_RESPONSE'],
 ['wrong file endpoint',{body:'<a hx-get="/other/download?t=x">Download</a>'},'INVALID_PROVIDER_RESPONSE'],
 ['external endpoint',{body:'<a hx-get="https://evil.test/download?t=x">Download</a>'},'INVALID_PROVIDER_RESPONSE'],
 ['403',{status:403},'PROVIDER_FORBIDDEN'],['429',{status:429},'PROVIDER_RATE_LIMITED'],['503',{status:503},'PROVIDER_HTTP_ERROR'],
 ['challenge',{status:403,body:'Just a moment <script src="/cdn-cgi/challenge-platform/x">'},'PROVIDER_CHALLENGE'],
 ['timeout',{fail:'PROVIDER_TIMEOUT'},'PROVIDER_TIMEOUT'],['expired provider endpoint',{endpointStatus:410},'SOURCE_REMOVED'],
 ['malformed HX redirect',{headers:{'hx-redirect':'javascript:alert(1)'}},'INVALID_SOURCE'],
 ['unexpected file host',{headers:{'hx-redirect':'https://evil.test/d/file-xyz?v=x'}},'INVALID_SOURCE'],
 ['unsigned file URL',{headers:{'hx-redirect':'https://fafda.to/d/file-xyz'}},'INVALID_PROVIDER_RESPONSE'],
 ['local HX',{headers:{'hx-redirect':'https://127.0.0.1/d/file-xyz?v=x'}},'INVALID_SOURCE'],
 ['CRLF HX',{headers:{'hx-redirect':destination+'\r\nInjected: value'}},'INVALID_PROVIDER_RESPONSE'],
])test(name,async()=>{await assert.rejects(steam.steamripDestination(source,signal(),fixture(change).fn),error(code));});
for(const raw of ['http://bzzhr.to/file','https://user:pw@bzzhr.to/file','https://bzzhr.to:443/file','https://bzzhr.to:444/file','https://bzzhr.to/file#','https://bzzhr.to.evil.test/file','https://bzzhr.to/\nfile','https://bzzhr.to\\@127.0.0.1/file'])test('invalid provider URL '+JSON.stringify(raw),()=>assert.throws(()=>http.publicUrl(raw,bzzhr.BZZHR_HOSTS)));
for(const ip of ['0.0.0.0','10.1.1.1','100.64.0.1','127.1.2.3','169.254.169.254','172.16.1.1','192.168.1.1','198.18.1.1','198.51.100.1','224.1.1.1','240.0.0.1','::1','::ffff:8.8.8.8','64:ff9b::a00:1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1','3fff::1'])test('non-global DNS '+ip,async()=>{assert.equal(http.globalAddress(ip),false);await assert.rejects(http.vettedAddresses('bzzhr.to',signal(),async()=>[{address:'8.8.8.8',family:4},{address:ip,family:ip.includes(':')?6:4}]),error('INVALID_SOURCE'));});
test('native global IPv4/IPv6 permitted',()=>{assert.ok(http.globalAddress('8.8.8.8'));assert.ok(http.globalAddress('2606:4700:4700::1111'));});
// Exercise actual publicHttp transport with mocked DNS and TLS sockets (no live CI requests).
const https=require('node:https'),dns=require('node:dns/promises'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
async function transport(t,responses,dnsRows=[{address:'8.8.8.8',family:4}]) {
 const calls=[],headerRecords=[];let lookups=0;
 t.mock.method(dns,'lookup',async()=>{lookups++;return dnsRows;});
 t.mock.method(https,'request',(url,options,callback)=>{
  calls.push(url.href);headerRecords.push(options.headers);assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.equal(options.family,4);
  options.lookup(url.hostname,{},(err,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4);});
  const req=new EventEmitter();req.destroy=err=>{req.emit('error',err);req.emit('close');};
  req.end=()=>queueMicrotask(()=>{
   const socket=new EventEmitter();req.emit('socket',socket);socket.emit('secureConnect');
   const spec=responses.shift();assert.ok(spec);const res=new PassThrough();res.statusCode=spec.status??200;res.headers=spec.headers??{};res.setTimeout=()=>{};
   callback(res);res.end(spec.body??'OK');req.emit('close');
  });return req;
 });return {calls,headerRecords,get lookups(){return lookups;}};
}
test('DNS rebinding: connection uses exactly the vetted numerical address, no second DNS',async t=>{const h=await transport(t,[{}]);assert.equal((await http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal())).body,'OK');assert.equal(h.lookups,1);});
for(const location of ['https://localhost/private','https://evil.test/file','https://127.0.0.1/private'])test('redirect denied before contacting '+location,async t=>{const h=await transport(t,[{status:302,headers:{location}}]);await assert.rejects(http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal()),error('INVALID_SOURCE'));assert.equal(h.calls.length,1);});
test('known mirror redirect is re-resolved and validated',async t=>{const h=await transport(t,[{status:302,headers:{location:'https://bzzhr.co/file-xyz'}},{}]);assert.equal((await http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal())).url,'https://bzzhr.co/file-xyz');assert.equal(h.lookups,2);});
test('redirect loop bounded at four requests',async t=>{const h=await transport(t,Array.from({length:4},()=>({status:302,headers:{location:page}})));await assert.rejects(http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal()),error('PROVIDER_REDIRECT_LOOP'));assert.equal(h.calls.length,1);});
for(const headers of [{'content-length':'1048577'},{'content-encoding':'gzip'}])test('oversized/encoded response fails closed '+JSON.stringify(headers),async t=>{await transport(t,[{headers}]);await assert.rejects(http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal()),error('INVALID_PROVIDER_RESPONSE'));});
test('streamed oversized body is bounded',async t=>{await transport(t,[{body:'x'.repeat(1048577)}]);await assert.rejects(http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal()));});
test('DNS cancellation bounded',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(http.vettedAddresses('bzzhr.to',controller.signal,()=>new Promise(()=>{})),error('PROVIDER_TIMEOUT'));});
test('resolution deduplication, two-operation cap, revision binding and no completed cache',async()=>{
 let calls=0,releases=[];const resolver=steam.createSteamripResolver(async()=>{calls++;await new Promise(r=>releases.push(r));return destination;},async()=>{});
 const a=resolver(1,'rev',source),b=resolver(1,'rev',source),c=resolver(2,'rev',source);
 assert.equal(calls,2);await assert.rejects(resolver(3,'rev',source),error('PROVIDER_BUSY'));
 releases.splice(0).forEach(r=>r());assert.equal(await a,destination);assert.equal(await b,destination);await c;
 const fresh=resolver(1,'new-rev',source);assert.equal(calls,3);releases.splice(0).forEach(r=>r());await fresh;
 const again=resolver(1,'new-rev',source);assert.equal(calls,4);releases.splice(0).forEach(r=>r());await again;
});
test('failed provider opens bounded backoff then permits recovery',async()=>{
 let clock=1000,calls=0;const resolver=steam.createSteamripResolver(async()=>{calls++;throw http.providerError();},async()=>{},()=>clock);
 await assert.rejects(resolver(1,'r',source));await assert.rejects(resolver(1,'r',source),error('PROVIDER_BUSY'));assert.equal(calls,1);clock+=10001;await assert.rejects(resolver(1,'r',source));assert.equal(calls,2);
});

test('provider session cookie is scoped to same-host HTMX endpoint only',async()=>{const f=fixture();const wrapped=async(...args)=>{const result=await f.fn(...args);if(args[0]===page)result.headers['set-cookie']='session=fixture-cookie';return result;};assert.equal(await steam.steamripDestination(source,signal(),wrapped),destination);assert.equal(f.calls[2].headers.Cookie,'session=fixture-cookie');assert.equal(f.calls[0].headers,undefined);});

test('raw redirect whitespace rejected before URL normalization',async t=>{const h=await transport(t,[{status:302,headers:{location:'https://bzzhr.co/file\n-xyz'}}]);await assert.rejects(http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal()),error('INVALID_PROVIDER_RESPONSE'));assert.equal(h.calls.length,1);});

for(const raw of ['https://fafda.to/d/file/a%0A?v=x','https://fafda.to/d/file/%zz?v=x'])test('encoded malformed destination rejected '+raw,()=>assert.throws(()=>bzzhr.signedDestination(raw,endpoint),error('INVALID_PROVIDER_RESPONSE')));

for(const html of ['<a '.repeat(100000),'<a data-href="https://bzzhr.to/wrong">Fake</a>','<!-- <a href="https://bzzhr.to/wrong"> -->',`<script>const html='<a href="https://bzzhr.to/wrong">';</script>`])test('malformed/comment/script attributes are not source links '+html.slice(0,30),()=>assert.throws(()=>steam.steamripBzzhr(html,source),error('BZZHR_NOT_FOUND')));
test('real href wins over a link mentioned inside quoted title text',()=>assert.equal(steam.steamripBzzhr(`<a title='href="https://bzzhr.to/wrong"' href="${page}">Download</a>`,source),page));

test('HTML tag work is bounded',()=>assert.throws(()=>steam.steamripBzzhr('<div></div>'.repeat(10001),source),error('INVALID_PROVIDER_RESPONSE')));
test('quoted HTMX mention cannot replace the real signed endpoint',()=>assert.equal(bzzhr.signedEndpoint(`<button title='hx-get="/file-xyz/download?t=wrong"' hx-get="${endpoint}">Download</button>`,page),endpoint));

test('live observed ts CDN is accepted, arbitrary CDN subdomains remain denied',()=>{
 assert.equal(bzzhr.signedDestination('https://ts.buzzheavier.com/d/724hyjkckpyu?v=redacted',endpoint),'https://ts.buzzheavier.com/d/724hyjkckpyu?v=redacted');
 assert.throws(()=>bzzhr.signedDestination('https://evil.buzzheavier.com/d/file?v=x',endpoint),error('INVALID_SOURCE'));
});
test('provider-declared alternate path/query and malformed HTML are parsed without constructing an endpoint',()=>{
 assert.equal(bzzhr.signedEndpoint('<BUTTON data-hx-get="/fake" HX-GET="file-xyz/fetch?signature=a&amp;alt=true">', page),page+'/fetch?signature=a&alt=true');
});
test('HEAD final validation accepts attachment and refuses HTML, deleted/expired responses and forbidden access',async()=>{
 for(const [status,headers,code] of [[200,{'content-type':'application/octet-stream'},null],[200,{'content-type':'text/html'},'INVALID_FILE_RESPONSE'],[410,{},'SOURCE_REMOVED'],[403,{},'PROVIDER_FORBIDDEN']]){
  const fn=async(url,hosts,sig,headersIn,follow,method)=>{assert.equal(method,'HEAD');assert.equal(follow,true);assert.deepEqual(headersIn,{});return {url,status,headers,body:''};};
  const work=bzzhr.validateBzzhrDns(destination,signal(),fn);
  if(code)await assert.rejects(work,e=>e.code===code&&e.stage==='final_file'&&e.host==='fafda.to');else await work;
 }
});
test('stage identifies SteamRIP challenge separately from a BZZHR challenge',async()=>{
 const fn=async url=>({url,status:403,headers:{'cf-mitigated':'challenge'},body:''});
 await assert.rejects(steam.steamripDestination(source,signal(),fn),e=>e.code==='PROVIDER_CHALLENGE'&&e.stage==='steamrip'&&e.upstreamStatus===403);
 await assert.rejects(steam.steamripDestination(page,signal(),fn),e=>e.code==='PROVIDER_CHALLENGE'&&e.stage==='bzzhr_page');
});
test('missing HX redirect is diagnosed at the HTMX stage',async()=>{
 await assert.rejects(steam.steamripDestination(source,signal(),fixture({headers:{}}).fn),e=>e.code==='MISSING_HX_REDIRECT'&&e.stage==='bzzhr_htmx');
});
test('alternate provider-declared endpoint used when first endpoint fails, bounded to three',async()=>{
 const endpoints=bzzhr.signedEndpoints('<a hx-get="/file-xyz/fetch?s=a"><a hx-get="/file-xyz/fetch?s=b"><a hx-get="/file-xyz/fetch?s=c"><a hx-get="/file-xyz/fetch?s=d">',page);
 assert.equal(endpoints.length,3);let calls=0;
 const fn=async(url,hosts,sig,headers,follow,method)=>{
  if(url===page)return {url,status:200,headers:{},body:'<a hx-get="/file-xyz/fetch?s=a"><a hx-get="/file-xyz/fetch?s=b">'};
  if(method==='HEAD')return {url,status:200,headers:{'content-type':'application/octet-stream'},body:''};
  calls++;return {url,status:calls===1?503:204,headers:calls===1?{}:{'hx-redirect':destination},body:''};
 };
 assert.equal(await bzzhr.resolveBzzhr(page,signal(),fn),destination);assert.equal(calls,2);
});
test('HEAD transport never reads large file bytes and strips cookies across redirects',async t=>{
 const original=await transport(t,[{status:302,headers:{location:'https://ts.buzzheavier.com/d/file?v=x'}},{headers:{'content-length':'99999999999','content-type':'application/octet-stream'}}]);
 assert.equal((await http.publicHttp(destination,bzzhr.BZZHR_FILE_HOSTS,signal(),{Cookie:'session=secret'},true,'HEAD')).status,200);assert.equal(original.calls.length,2);assert.equal(original.headerRecords[0].Cookie,'session=secret');assert.equal(original.headerRecords[1].Cookie,undefined);
});
test('page redirect cookies retain same-host session; path and mirror boundaries do not leak cookies',async t=>{
 const h=await transport(t,[{status:302,headers:{location:page+'/landing','set-cookie':['session=secret; Path=/file-xyz; Secure','other=x; Path=/private']}},{}]);
 const result=await http.publicHttp(page,bzzhr.BZZHR_HOSTS,signal());
 assert.equal(h.headerRecords[1].Cookie,'session=secret');
 assert.equal(http.cookieHeader(result.cookies,page+'/download?t=x'),'session=secret');
 assert.equal(http.cookieHeader(result.cookies,'https://bzzhr.co/file-xyz/download?t=x'),'');
 assert.equal(http.cookieHeader(result.cookies,'https://bzzhr.to/file-xyzz/download?t=x'),'');
});
