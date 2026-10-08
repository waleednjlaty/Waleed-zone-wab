'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
require('./helpers/typescript.cjs');
const {normalizeLocale,localeDirection,localeFromCookie}=require('../src/lib/locale.ts');
const {translateUI}=require('../src/lib/ui-translations.ts');
const dictionary=require('../src/lib/ui-en.json');
test('locale defaults, exact cookie parsing and invalid preference fail safely to Arabic',()=>{
 assert.equal(normalizeLocale(undefined),'ar');assert.equal(normalizeLocale('en'),'en');assert.equal(normalizeLocale('EN'),'ar');
 assert.equal(localeDirection('ar'),'rtl');assert.equal(localeDirection('en'),'ltr');
 for(const cookie of [null,'','wz_locale=bad','wz_locale=en; wz_locale=ar','wz_locale=%65n','wz_locale=en<script>'])assert.equal(localeFromCookie(cookie),'ar');
 assert.equal(localeFromCookie('session=untouched; wz_locale=en; x=y'),'en');
});
test('static UI translation preserves Arabic and interpolates values without translating catalog content',()=>{
 for(const [ar,en] of Object.entries(dictionary)){
  assert.equal(translateUI('ar',ar),ar);assert.equal(translateUI('en',ar),en);
  assert.ok(!/[\u0600-\u06ff]/.test(en),ar+' contains Arabic in its English translation');
  assert.deepEqual(ar.match(/\{\d+\}/g)||[],en.match(/\{\d+\}/g)||[],ar+' interpolation mismatch');
 }
 assert.equal(translateUI('en','أيقونة {0}','اسم تطبيق عربي'),'اسم تطبيق عربي icon');
 assert.equal(translateUI('en','unrecognized catalog name'),'unrecognized catalog name');
 assert.equal(translateUI('en','طلبات كثيرة. انتظر 60 ثانية ثم أعد المحاولة.'),'Too many requests. Wait 60 seconds and try again.');
});
test('every translated static callsite has a reviewed English entry',()=>{
 const visitDir=d=>{for(const entry of fs.readdirSync(d,{withFileTypes:true})){const file=path.join(d,entry.name);if(entry.isDirectory())visitDir(file);else if(file.endsWith('.tsx')){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(source)==='t'&&ts.isStringLiteral(n.arguments[0])&&/[\u0600-\u06ff]/.test(n.arguments[0].text))assert.ok(Object.hasOwn(dictionary,n.arguments[0].text),file+': '+n.arguments[0].text);ts.forEachChild(n,visit);}visit(source);
 }}};visitDir(path.join(__dirname,'../src'));
});
const load=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return load.call(this,name,...args);};
const {providerRetry}=require('../src/lib/delivery/retry.ts'),{DownloadError}=require('../src/lib/downloads/rules.ts'),{downloadErrorResponse}=require('../src/lib/downloads/http.ts');Module._load=load;
test('provider retry HTML follows request locale with exact self-only CSP and no error leakage',async()=>{
 for(const locale of ['ar','en'])for(const code of ['PROVIDER_CHALLENGE','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMITED','BZZHR_NOT_FOUND','PROVIDER_UNAVAILABLE']){
  const request=new Request('https://example.test',{headers:{cookie:'wz_locale='+locale}}),error=new DownloadError(503,code);
  const r=providerRetry(error,201,'fixture.'+'x'.repeat(43),request),html=await r.text();
  assert.equal(r.status,503);assert.equal(r.headers.get('content-security-policy'),"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  assert.ok(html.includes(`lang="${locale}" dir="${localeDirection(locale)}"`));assert.ok(html.includes('action="/api/downloads/legacy/redeem" method="post"'));
  assert.ok(html.includes(locale==='en'?'Retry safely':'إعادة المحاولة بأمان'));
  if(locale==='en')assert.ok(!/[\u0600-\u06ff]/.test(html));
 }
 assert.equal(providerRetry(new DownloadError(503,'PROVIDER_UNAVAILABLE'),201,'bad<script>'),null);
 assert.equal(providerRetry(new Error('secret signed URL'),201,'fixture.'+'x'.repeat(43)),null);
});
test('generic redemption HTML localizes while API JSON contracts stay unchanged',async()=>{
 const error=new DownloadError(410,'SOURCE_REMOVED'),req=new Request('https://example.test',{headers:{cookie:'wz_locale=en',accept:'text/html'}});
 const html=await downloadErrorResponse(error,req,true).text();assert.ok(html.includes('lang="en" dir="ltr"'));assert.ok(html.includes('The source was removed'));assert.ok(!/[\u0600-\u06ff]/.test(html));
 const api=await downloadErrorResponse(error,req,false).json();assert.equal(api.error.code,'SOURCE_REMOVED');assert.equal(api.error.message,'المصدر أُزيل أو لم يعد متاحًا.');
});
