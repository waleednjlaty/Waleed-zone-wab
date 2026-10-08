const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
require('./helpers/typescript.cjs');
require.extensions['.css'] = module => { module.exports = {}; };
const catalog = Array.from({ length: 27 }, (_, i) => ({ id: i + 1, name: `Tool ${i + 1}`, category: 'أدوات', createdAt: null }));
catalog.push({ id: 90, name: 'Game 90', category: 'ألعاب', createdAt: new Date('2026-09-01') });
let entries = catalog;
let locale = 'ar';
const load = Module._load;
Module._load = function(request, ...rest) {
  // Next supplies React.cache in the server runtime; unit tests have no RSC request.
  if (request === 'react') return { ...load.call(this, request, ...rest), cache: fn => fn };
  if (request === 'server-only') return {};
  if (request === 'next/headers') return {cookies:async()=>({get:name=>name==='wz_locale'?{value:locale}:undefined})};
  if (request === '@/lib/queries') return { getAllAppsSitemap: async () => entries, getCatalogPage: async (kind,page) => { const all=entries.filter(app=>require('../src/components/catalog/presentation.ts').isGame(app)===(kind==='games')); return {items:all.slice((page-1)*24,page*24),total:all.length,totalPages:Math.max(1,Math.ceil(all.length/24)),currentPage:page}; }, getCategories: async () => [...new Set(entries.map(app => app.category))] };
  if (request === './resolve' && rest[0]?.filename.endsWith('/src/lib/catalog/seo.ts')) return { resolveDetail: async slug => ({ id: slug.endsWith('-90') ? 90 : 1, name: slug.endsWith('-90') ? 'Game 90' : 'Tool 1', category: slug.endsWith('-90') ? 'ألعاب' : 'أدوات', description: 'Shared description', version: '1.2', size: '20 MB', imageUrl: 'https://example.test/icon.png' }) };
  return load.call(this, request, ...rest);
};
const { pageMetadata, websiteStructuredData, breadcrumbStructuredData } = require('../src/lib/seo.ts');
const { HOME_TITLE, SITE_URL } = require('../src/lib/site.ts');
const { generateMetadata: homeMetadata } = require('../src/app/page.tsx');
const { generateMetadata: privacyMetadata } = require('../src/app/privacy/page.tsx');
const { generateMetadata: aboutMetadata } = require('../src/app/about/page.tsx');
const { getLanding, landingMetadata } = require('../src/lib/catalog/landing.ts');
const { detailMetadata } = require('../src/lib/catalog/seo.ts');
const sitemap = require('../src/app/sitemap.ts').default;
const robots = require('../src/app/robots.ts').default;

test('homepage has a bilingual absolute title and consistent canonical/social metadata', async () => {
  const metadata = await homeMetadata({ searchParams: Promise.resolve({}) });
  assert.deepEqual(metadata.title, { absolute: HOME_TITLE });
  assert.match(HOME_TITLE, /Waleed Zone.*وليد زون/);
  assert.equal(metadata.alternates.canonical, '/');
  assert.equal(metadata.openGraph.url, SITE_URL);
  assert.equal(metadata.openGraph.title, HOME_TITLE);
  assert.equal(metadata.twitter.description, metadata.description);
  assert.equal(metadata.robots.index, true);
});

test('search/filter/library variants stay noindex and canonicalize to homepage', async () => {
  for (const params of [{ q: 'واتساب' }, { q: ['Telegram', 'other'] }, { category: 'ألعاب' }, { page: '2' }, { browse: 'all' }]) {
    const metadata = await homeMetadata({ searchParams: Promise.resolve(params) });
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, true);
    assert.equal(metadata.alternates.canonical, '/');
    assert.notDeepEqual(metadata.title, { absolute: HOME_TITLE });
  }
});

test('page metadata does not inherit homepage social URLs or duplicate brand suffixes', () => {
  const metadata = pageMetadata('عن وليد زون', 'About description', '/about');
  assert.equal(metadata.openGraph.url, SITE_URL + '/about');
  assert.equal(metadata.openGraph.title, 'عن وليد زون | Waleed Zone');
  assert.equal(metadata.twitter.title, metadata.openGraph.title);
  assert.equal(metadata.description, metadata.openGraph.description);
});

test('WebSite identifies the brand without invented business/search/rating schema', () => {
  const data = websiteStructuredData();
  assert.equal(data['@type'], 'WebSite');
  assert.equal(data.name, 'Waleed Zone');
  assert.equal(data.alternateName, 'وليد زون');
  assert.equal(data.url, SITE_URL);
  for (const key of ['potentialAction', 'publisher', 'aggregateRating', 'offers']) assert.equal(data[key], undefined);
});

test('privacy is crawlable noindex/follow with its own canonical; about is indexable', async () => {
  const privacy=await privacyMetadata(),about=await aboutMetadata();
  assert.deepEqual(privacy.robots, { index: false, follow: true });
  assert.equal(privacy.alternates.canonical, '/privacy');
  assert.equal(privacy.openGraph.url, SITE_URL + '/privacy');
  assert.equal(about.robots.index, true);
  const disallow = robots().rules[0].disallow;
  for (const path of ['/privacy', '/terms', '/download', '/login', '/register', '/api/']) assert.ok(!disallow.includes(path));
  assert.ok(disallow.includes('/admin'));
  assert.equal(robots().sitemap, SITE_URL + '/sitemap.xml');
});

test('landing pages separate apps/games with unique paginated metadata and real counts', async () => {
  const apps = await getLanding('apps', 1), second = await getLanding('apps', 2), games = await getLanding('games', 1);
  assert.equal(apps.items.length, 24);
  assert.equal(apps.total, 27);
  assert.equal(second.items.length, 3);
  assert.deepEqual(games.items.map(item => item.id), [90]);
  const metadata = await landingMetadata('apps', 2);
  assert.equal(metadata.alternates.canonical, '/apps?page=2');
  assert.match(metadata.title, /صفحة 2/);
  assert.equal(metadata.openGraph.url, SITE_URL + '/apps?page=2');
  assert.notEqual((await landingMetadata('apps', 1)).description, metadata.description);
  await assert.rejects(() => getLanding('apps', 999), /NEXT_HTTP_ERROR_FALLBACK;404/);
});

test('empty landing pages are noindex and absent from the sitemap', async () => {
  entries = [];
  try {
    assert.equal((await landingMetadata('apps', 1)).robots.index, false);
    const paths = (await sitemap()).map(item => new URL(item.url).pathname);
    assert.deepEqual(paths, ['/', '/about']);
  } finally { entries = catalog; }
});

test('sitemap contains only public canonical pages and stable detail URLs', async () => {
  const urls = (await sitemap()).map(item => item.url);
  assert.equal(urls.length, new Set(urls).size);
  for (const path of ['/', '/apps', '/games', '/about', '/apps/tool-1-1', '/games/game-90-90']) assert.ok(urls.includes(path === '/' ? SITE_URL : SITE_URL + path));
  assert.ok(urls.every(url => !/\/api\/|\/account|\/login|\/register|\/privacy|\/terms|\/download|\/app\/|\?/.test(url)));
  assert.ok(urls.every(url => new URL(url).origin === new URL(SITE_URL).origin));
});

test('app/game descriptions remain distinct when catalog descriptions are duplicated', async () => {
  const apps = await detailMetadata('tool-1-1', 'apps'), games = await detailMetadata('game-90-90', 'games');
  assert.notEqual(apps.title, games.title);
  assert.notEqual(apps.description, games.description);
  assert.equal(apps.openGraph.url, SITE_URL + '/apps/tool-1-1');
  assert.equal(games.alternates.canonical, '/games/game-90-90');
  assert.equal(apps.openGraph.description, apps.description);
  assert.equal(apps.twitter.description, apps.description);
});

test('breadcrumb positions are consecutive and retain canonical item URLs', () => {
  const items = [{ name: 'الرئيسية', item: SITE_URL + '/' }, { name: 'الألعاب', item: SITE_URL + '/games' }, { name: 'Game 90', item: SITE_URL + '/games/game-90-90' }];
  const data = breadcrumbStructuredData(items);
  assert.equal(data['@type'], 'BreadcrumbList');
  assert.deepEqual(data.itemListElement.map(item => item.position), [1, 2, 3]);
  assert.deepEqual(data.itemListElement.map(item => item.item), items.map(item => item.item));
});

test('English metadata follows locale without inventing language URLs',async()=>{
 locale='en';
 try{
  const home=await homeMetadata({searchParams:Promise.resolve({})});
  assert.deepEqual(home.title,{absolute:'Waleed Zone — Apps & Games'});
  assert.equal(home.openGraph.locale,'en_US');assert.equal(home.alternates.canonical,'/');
  assert.equal(websiteStructuredData('en').inLanguage,'en');
  for(const metadata of [await aboutMetadata(),await privacyMetadata(),await landingMetadata('apps',2),await detailMetadata('tool-1-1','apps')]){
   assert.equal(metadata.openGraph.locale,'en_US');assert.ok(!/[\u0600-\u06ff]/.test(metadata.description));
   assert.equal(metadata.alternates.languages,undefined);assert.ok(!metadata.alternates.canonical.startsWith('/en'));
  }
 }finally{locale='ar';}
});
