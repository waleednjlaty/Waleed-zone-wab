/** Scan actual browser build output without echoing credentials or matched text. */
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root='.next/static';assert.ok(existsSync(root),'Build first.');
const privateKey=/^(?:BOT_TOKEN|DATABASE_URL|OWNER_USER_ID|LEGACY_DOWNLOAD_SIGNING_KEY|WEBSITE_STATS_TOKEN|VISIT_KEY_SALT|DOWNLOAD_(?:IP_HASH.*KEY|S3_.*KEY|STORAGE_.*KEY))$/;
const values=Object.entries(process.env).filter(([k,v])=>privateKey.test(k)&&v&&v.length>=8).map(([,v])=>v);
const patterns=[/process\.env\.(?:BOT_TOKEN|DATABASE_URL|OWNER_USER_ID|LEGACY_DOWNLOAD_SIGNING_KEY|WEBSITE_STATS_TOKEN)/,
 /https?:\/\/api\.telegram\.org\/(?:file\/)?bot/i,/postgres(?:ql)?:\/\/[^\s"']+/i,/X-Amz-(?:Signature|Credential)=/i];
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
let files=0;
for(const path of walk(root).filter(p=>/\.(?:js|json|html|map|css)$/.test(p))){
 const text=readFileSync(path,'utf8');files++;
 assert.ok(!values.some(v=>text.includes(v))&&!patterns.some(r=>r.test(text)),'Private content in client build: '+path);
}
for(const key of Object.keys(process.env))if(key.startsWith('NEXT_PUBLIC_')&&/(TOKEN|PASSWORD|SECRET|SIGNING|DATABASE|OWNER_USER_ID)/.test(key))throw Error('Private NEXT_PUBLIC configuration rejected (variable name only): '+key);
console.log(`Client secret scan passed: ${files} build files; no private values printed.`);
