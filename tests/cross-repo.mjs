/** Native PostgreSQL + real Next HTTP + existing Python bot repositories. Opt-in. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const config=JSON.parse(readFileSync(process.env.WZ_TEST_CONFIG,'utf8')),base=config.base;
const dbUrl=new URL(process.env.WZ_TEST_DATABASE_URL);
assert.equal(dbUrl.hostname,'127.0.0.1');assert.match(dbUrl.pathname,/^\/wz_phase2_test_[a-z0-9]+$/);
const session=await fetch(base+'/api/admin/session',{headers:{Cookie:config.ownerCookie}}).then(r=>r.json());
const metadata={name:'Website cross-repo draft',description:'Native shared DB',version:'1',size:'24 B',category:'أدوات',platform:'Android',developer:'QA',image_url:null};
const headers={Cookie:config.ownerCookie,Origin:base,'Content-Type':'application/json','X-CSRF-Token':session.csrf_token};
const created=await fetch(base+'/api/admin/catalog',{method:'POST',headers,body:JSON.stringify({metadata})});assert.equal(created.status,200);const app=await created.json();
const python=`
import asyncio, json, os
from database.database import Database
from database import repositories as repo
from sqlalchemy.orm.exc import StaleDataError
async def run():
    db=Database(os.environ['DATABASE_URL'])
    await db.init_models()
    async with db.session() as session:
        site=await repo.get_application(session,${app.id})
        assert site.name == 'Website cross-repo draft' and not site.published
        rows=await repo.list_applications(session,active_only=False,public_only=False)
        assert any(a.id==site.id for a in rows)
        source=dict(telegram_chat_id=-1001,telegram_message_id=123,telegram_channel_username='files_channel',telegram_file_id='QA_NATIVE_FILE',filename='qa.apk',size_bytes=24,mime_type='application/vnd.android.package-archive')
        await repo.bind_telegram_source(session,site.id,source,expected_revision=site.revision)
        site.name='Bot edited shared row'
        site.published=True
        await session.commit()
        bot=await repo.create_application(session,name='Bot cross-repo app',category='أدوات',platform='Android',search_text='bot cross-repo app')
        await repo.bind_telegram_source(session,bot.id,source)
        bot.published=True
        await session.commit()
        # Two native pools capture the same revision; second ORM flush must fail.
        async with db.session() as rival:
            other=await repo.get_application(rival,bot.id)
            stale_revision=other.revision
            bot.version='winning version'
            await session.commit()
            other.version='stale version'
            try:
                await rival.flush()
                raise AssertionError('lost update was permitted')
            except StaleDataError:
                await rival.rollback()
        print(json.dumps({'bot_id':bot.id,'revision':bot.revision}))
    await db.close()
asyncio.run(run())
`;
const result=await new Promise((resolve,reject)=>{
 const child=spawn(process.env.WZ_BOT_TEST_PYTHON,['-c',python],{cwd:process.env.WZ_BOT_REPOSITORY,env:{...process.env,BOT_TOKEN:'123456:QA-ONLY',ADMIN_IDS:'111',DATABASE_URL:process.env.WZ_TEST_DATABASE_URL.replace('postgres://','postgresql+asyncpg://')},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGTERM'),30000);
 child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
 child.on('error',reject);child.on('exit',status=>{clearTimeout(timer);resolve({status,stdout,stderr});});
});
assert.equal(result.status,0,result.stderr);const {bot_id}=JSON.parse(result.stdout.trim());
const current=await fetch(base+'/api/admin/catalog/'+app.id,{headers:{Cookie:config.ownerCookie}}).then(r=>r.json());assert.equal(current.name,'Bot edited shared row');assert.equal(current.source.message_id,123);assert.equal(current.published,true);
const stale=await fetch(base+'/api/admin/catalog/'+app.id,{method:'PATCH',headers,body:JSON.stringify({metadata,expected_revision:app.revision})});assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'STALE_REVISION');
for(const id of [app.id,bot_id]){const html=await fetch(base+'/app/'+id).then(r=>r.text());assert.ok(html.includes(id===app.id?'Bot edited shared row':'Bot cross-repo app'));assert.ok(!html.includes('QA_NATIVE_FILE'));}
const search=await fetch(base+'/api/search?q='+encodeURIComponent('Bot cross-repo app')).then(r=>r.text());assert.ok(search.includes('Bot cross-repo app'),'Bot commit visible immediately in site search');
console.log('Cross-repo native PostgreSQL: website draft seen/attached by Python bot; bot commits visible in site detail/search; website 409 and two-pool bot stale writes denied.');
