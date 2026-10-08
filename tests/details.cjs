const assert=require('node:assert/strict');
const {test}=require('node:test');
require('./helpers/typescript.cjs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {getCatalogDetails}=require('../src/lib/catalog/metadata.ts');
const entries=require('../src/data/catalog-details.json');
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){if(name==='@/lib/locale-server')return {getLocale:async()=> 'ar'};return load.call(this,name,...args);};
const Screenshots=require('../src/components/details/Screenshots.tsx').default;
const Versions=require('../src/components/details/Versions.tsx').default;
const Description=require('../src/components/details/ExpandableDescription.tsx').default;
test('absent catalog extensions do not fabricate screenshots or history',()=>{const details=getCatalogDetails(987654321);assert.equal(details.screenshots,undefined);assert.equal(details.versions,undefined);});
test('optional screenshots and version rows reject unusable values',async()=>{
 entries['987654321']={screenshots:[{url:'javascript:alert(1)'},{url:'https://example.test/screenshot.jpg',alt:'QA image'}],versions:[{version:''},{version:'1.2',size:'10 MB',releaseDate:'2026-01-01',architecture:'arm64'}]};
 const details=getCatalogDetails(987654321);assert.equal(details.screenshots.length,1);assert.equal(details.versions.length,1);
 const screenshots=renderToStaticMarkup(await Screenshots({images:details.screenshots,name:'QA fixture'}));assert.match(screenshots,/loading="lazy"/);assert.match(screenshots,/tabindex="0"/);assert.ok(!screenshots.includes('javascript:'));
 const versions=renderToStaticMarkup(await Versions({items:details.versions}));assert.ok(versions.includes('1.2')&&versions.includes('arm64')&&/datetime="2026-01-01"/i.test(versions));assert.ok(!versions.includes('href=')&&!versions.includes('N/A'));
 delete entries['987654321'];
});
test('empty version history explains the missing data',async()=>assert.match(renderToStaticMarkup(await Versions({items:[]})),/لا تتوفر إصدارات سابقة/));
test('long description is collapsed, expandable, semantic and escaped',()=>{
 const html=renderToStaticMarkup(React.createElement(Description,{text:'<script>alert(1)</script>'+ 'description '.repeat(100)}));assert.match(html,/is-collapsed/);assert.match(html,/aria-expanded="false"/);assert.match(html,/قراءة المزيد/);assert.ok(html.includes('&lt;script&gt;')&&!html.includes('<script>'));
});
