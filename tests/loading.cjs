const assert=require('node:assert/strict');
const {test}=require('node:test');
require('./helpers/typescript.cjs');
require.extensions['.css']=module=>{module.exports=new Proxy({},{get:(_,name)=>name==='__esModule'?false:name});};
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const Details=require('../src/components/loading/DetailsSkeleton.tsx').default;
const Search=require('../src/components/loading/SearchResultsSkeleton.tsx').default;
const html=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
test('detail loading preserves Phase 2 structure without focusable fake actions',()=>{
 const markup=html(Details,{});
 for(const className of ['shell detail-page','detail-summary','detail-identity','detail-content-grid','detail-technical'])assert.ok(markup.includes(className));
 assert.equal((markup.match(/role="status"/g)||[]).length,1);
 assert.match(markup,/aria-busy="true" aria-hidden="true"/);
 assert.ok(!/<(?:a|button|input)\b|tabindex=|screenshot-carousel/.test(markup));
});
test('search suggestions have one announcement and three decorative rows',()=>{
 const markup=html(Search,{count:3,suggestions:true});
 assert.equal((markup.match(/role="status"/g)||[]).length,1);
 assert.equal((markup.match(/class="skeleton suggestion"/g)||[]).length,3);
 assert.ok(!markup.includes('catalog-section')&&!markup.includes('<input'));
});
test('account loading override never includes private content or catalog placeholders',()=>{
 for(const route of ['account','login','register'])assert.equal(html(require(`../src/app/${route}/loading.tsx`).default,{}),'');
});
