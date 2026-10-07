/** Disposable loopback-only HTTP/RSC/browser QA using PGlite's optional socket wrapper.
 * Not a substitute for native PostgreSQL locking CI. No production credentials are inherited.
 */
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const module=process.env.WZ_PGLITE_SOCKET_MODULE;
assert.ok(module,'Set WZ_PGLITE_SOCKET_MODULE to an isolated pglite-socket index.js.');
const {PGLiteSocketServer}=await import(pathToFileURL(module).href);
const db=await PGlite.create();
const socket=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:2});
let child;
try {
 await socket.start();
 const address=socket.getServerConn(),port=Number(new URL('http://'+address).port);
 const env={...process.env};for(const key of Object.keys(env))if(/DATABASE_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|RAILWAY_|NEON_|SUPABASE_/.test(key))delete env[key];
 env.WZ_TEST_DATABASE_URL=`postgres://postgres@127.0.0.1:${port}/wz_phase2_test_local`;
 env.NEXT_TELEMETRY_DISABLED='1';
 child=spawn(process.execPath,['scripts/test-integration.mjs'],{env,stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
}finally{
 if(child&&child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped;}
 await socket.stop();await db.close();
}
