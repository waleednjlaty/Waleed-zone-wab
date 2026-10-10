'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),{readFileSync}=require('node:fs');require('./helpers/typescript.cjs');const load=Module._load;Module._load=function(n,...a){return n==='server-only'?{}:load.call(this,n,...a);};const {discoveryCache}=require('../src/lib/downloads/browser/cache.ts');Module._load=load;
test('discovery cache: additive migration, exact revision/source, 6-hour TTL, no signed links',async t=>{
 const h=await require('./admin/runtime.cjs').createFixture(t,{monetization:true});
 const migration=readFileSync('migrations/007_provider_discovery.sql','utf8');await h.db.exec(migration);await h.db.exec(migration);
 const cache=discoveryCache(h.sql),revision='a'.repeat(64),source='https://steamrip.com/qa-game/';
 await cache.write(201,revision,source,['https://buzzheavier.com/file-xyz','https://buzzheavier.com/file-xyz']);
 assert.deepEqual(await cache.read(201,revision,source),['https://buzzheavier.com/file-xyz']);
 assert.deepEqual(await cache.read(201,'b'.repeat(64),source),[]);assert.deepEqual(await cache.read(201,revision,source+'different'),[]);
 await assert.rejects(cache.write(201,revision,source,['https://ts.buzzheavier.com/d/file-xyz?v=secret']));
 await assert.rejects(cache.write(201,revision,source,['https://buzzheavier.com/file-xyz?sig=secret']));
 const [row]=await h.sql`SELECT extract(epoch FROM expires_at-clock_timestamp())::int AS seconds FROM site_provider_discovery WHERE application_id=201`;assert.ok(row.seconds>21590&&row.seconds<=21600);
 await h.sql`UPDATE site_provider_discovery SET expires_at=clock_timestamp()-interval '1 second' WHERE application_id=201`;assert.deepEqual(await cache.read(201,revision,source),[]);
 await cache.clear(201);assert.equal((await h.sql`SELECT * FROM site_provider_discovery`).length,0);
});
