const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const enabled = Boolean(process.env.WZ_TEST_CONFIG);
const config = enabled ? JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG, 'utf8')) : {};
if (enabled) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(config.base).hostname), 'Only isolated local SEO fixtures are allowed.');
const base = config.base;
const integration = (name, fn) => test(name, { skip: !enabled }, fn);
const request = path => fetch(base + path, { redirect: 'manual', headers: { 'User-Agent': 'Googlebot' } });
const decode = text => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function tags(html, tag) { return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => Object.fromEntries([...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]))); }
function meta(html, name) { return tags(html, 'meta').filter(item => item.name === name || item.property === name).map(item => item.content); }
function structured(html) { return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(([, json]) => JSON.parse(json)); }
async function page(path) { const response = await request(path); assert.equal(response.status, 200, path); return { response, html: await response.text() }; }
function canonical(html) { const values = tags(html, 'link').filter(item => item.rel === 'canonical'); assert.equal(values.length, 1); return values[0].href; }
function title(html) { const values = [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)]; assert.equal(values.length, 1); return decode(values[0][1]); }

integration('rendered branded homepage: one title/canonical, clear H1, crawlable landing links and WebSite', async () => {
  const { html, response } = await page('/');
  assert.equal(title(html), 'Waleed Zone | وليد زون — تطبيقات وألعاب');
  assert.equal(canonical(html), base);
  assert.deepEqual(meta(html, 'og:url'), [base]);
  assert.deepEqual(meta(html, 'description'), meta(html, 'og:description'));
  assert.match(html, /<h1[^>]*>وليد زون — تطبيقات وألعاب/);
  assert.match(html, /href="\/apps"/); assert.match(html, /href="\/games"/);
  assert.ok(!/noindex/.test(meta(html, 'robots').join(' ')));
  assert.ok(!response.headers.get('x-robots-tag'));
  const schemas = structured(html), website = schemas.filter(item => item['@type'] === 'WebSite');
  assert.equal(website.length, 1);
  assert.equal(website[0].alternateName, 'وليد زون');
  assert.equal(website[0].url, base);
  assert.ok(!schemas.some(item => item['@type'] === 'Organization'));
});

integration('public page titles/descriptions are distinct and social canonicals belong to each page', async () => {
  const titles = new Set(), descriptions = new Set();
  for (const path of ['/', '/apps', '/games', '/about', '/privacy', '/apps/whatsapp-201', '/games/clash-of-clans-207', '/category/' + encodeURIComponent('تواصل'), '/category/' + encodeURIComponent('ألعاب')]) {
    const { html } = await page(path), currentTitle = title(html), description = meta(html, 'description');
    assert.ok(!titles.has(currentTitle), `duplicate title: ${path}`); titles.add(currentTitle);
    assert.equal(description.length, 1); assert.ok(!descriptions.has(description[0]), `duplicate description: ${path}`); descriptions.add(description[0]);
    assert.equal(canonical(html), path === '/' ? base : base + path);
    assert.deepEqual(meta(html, 'og:url'), [path === '/' ? base : base + path]);
    assert.deepEqual(meta(html, 'og:description'), description);
    assert.deepEqual(meta(html, 'twitter:description'), description);
    if (path !== '/') assert.ok(!structured(html).some(item => item['@type'] === 'WebSite'), path);
  }
});

integration('privacy stays accessible, self-canonical and noindex/follow without robots disallow', async () => {
  const { html, response } = await page('/privacy');
  assert.equal(canonical(html), base + '/privacy');
  assert.match(meta(html, 'robots').join(' '), /noindex, follow/);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  const robots = await (await request('/robots.txt')).text();
  assert.match(robots, /Allow: \/\n/);
  for (const route of ['privacy', 'terms', 'login', 'register', 'api', 'download']) assert.ok(!robots.includes('Disallow: /' + route), route);
  assert.ok(robots.includes('Sitemap: ' + base + '/sitemap.xml'));
  for (const path of ['/login', '/register', '/api/search?q=Telegram', '/api/stats', '/download/201?request=private-token', '/terms']) {
    const response = await request(path);
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/, path);
  }
});

integration('API, private, legal, search, token URLs and drafts never appear in sitemap', async () => {
  const response = await request('/sitemap.xml'); assert.equal(response.status, 200);
  const html = await response.text(), urls = [...html.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => decode(url));
  assert.equal(urls.length, new Set(urls).size);
  for (const path of ['/', '/apps', '/games', '/about', '/apps/whatsapp-201', '/games/clash-of-clans-207']) assert.ok(urls.includes(path === '/' ? base : base + path), path);
  assert.ok(urls.every(url => !/\/api\/|\/account|\/admin|\/users|\/login|\/register|\/privacy|\/terms|\/download|\/app\/|private-draft|inactive-private|\?/.test(url)));
  for (const url of urls) {
    const { html: body, response: pageResponse } = await page(url.slice(base.length));
    assert.equal(canonical(body), url);
    assert.ok(!/noindex/.test(meta(body, 'robots').join(' ')), url);
    assert.ok(!/noindex/.test(pageResponse.headers.get('x-robots-tag') || ''), url);
  }
});

integration('real breadcrumb and collection schemas match the rendered canonical catalog', async () => {
  for (const path of ['/apps', '/games', '/apps/whatsapp-201', '/games/clash-of-clans-207', '/category/' + encodeURIComponent('ألعاب')]) {
    const { html } = await page(path), schemas = structured(html), breadcrumbs = schemas.find(item => item['@type'] === 'BreadcrumbList');
    assert.ok(breadcrumbs, path);
    assert.equal(breadcrumbs.itemListElement.at(-1).item, canonical(html));
    for (const [i, item] of breadcrumbs.itemListElement.entries()) {
      assert.equal(item.position, i + 1); assert.ok(item.name.trim());
      const response = await request(item.item.slice(base.length)); assert.equal(response.status, 200, item.item);
      assert.ok(!item.item.includes('#'));
    }
    const collection = schemas.find(item => item['@type'] === 'CollectionPage');
    if (collection) {
      assert.equal(collection.url, canonical(html));
      assert.equal(collection.mainEntity.numberOfItems, collection.mainEntity.itemListElement.length);
      for (const item of collection.mainEntity.itemListElement) { assert.ok(!item.url.includes('/app/')); assert.ok(item.name.trim()); }
    }
    assert.ok(!/priceCurrency|aggregateRating|downloadUrl|contentUrl/.test(JSON.stringify(schemas)));
  }
});

integration('search variants remain noindex and legacy detail routes redirect to canonical', async () => {
  for (const path of ['/?q=Telegram', '/?category=' + encodeURIComponent('ألعاب'), '/?page=2', '/?browse=all']) {
    const { html } = await page(path); assert.match(meta(html, 'robots').join(' '), /noindex/); assert.equal(canonical(html), base);
  }
  const response = await request('/app/201'); assert.equal(response.status, 308); assert.ok(response.headers.get('location').endsWith('/apps/whatsapp-201'));
  for (const path of ['/apps?page=9999', '/games?page=9999', '/category/' + encodeURIComponent('ألعاب') + '?page=9999']) {
    const response = await request(path), body = await response.text();
    // Next can stream a not-found UI after committing 200; it must then expose noindex.
    assert.ok([200, 404].includes(response.status), path);
    assert.match(meta(body, 'robots').join(' '), /noindex/, path);
    assert.ok(!structured(body).some(item => item['@type'] === 'CollectionPage'), path);
  }
});

integration('pagination has distinct metadata and self-canonical structured data', async () => {
  if (process.env.WZ_SEO_FIXTURES !== 'true') return;
  for (const path of ['/apps', '/category/' + encodeURIComponent('أدوات')]) {
    const first = await page(path), second = await page(path + '?page=2');
    assert.notEqual(title(first.html), title(second.html));
    assert.notDeepEqual(meta(first.html, 'description'), meta(second.html, 'description'));
    assert.equal(canonical(second.html), base + path + '?page=2');
    const collection = structured(second.html).find(item => item['@type'] === 'CollectionPage');
    assert.equal(collection.url, canonical(second.html));
    assert.equal(collection.mainEntity.numberOfItems, collection.mainEntity.itemListElement.length);
  }
});
