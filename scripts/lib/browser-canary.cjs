'use strict';
const assert=require('node:assert/strict');
const CANARY={id:'724hyjkckpyu',bytes:89,sha256:'9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2',expires:Date.parse('2026-10-12T00:00:00Z')};
function requireCanaryDestination(raw,now=Date.now()) {
 assert.ok(now<CANARY.expires,'CANARY_EXPIRED');
 assert.equal(new URL(raw).pathname.split('/')[2],CANARY.id,'CANARY_FILE_ID_MISMATCH');
}
function requireCanaryHeaders(status,headers) {
 assert.equal(status,200,'CANARY_HTTP_STATUS');
 assert.equal(headers['content-length'],String(CANARY.bytes),'CANARY_SIZE_MISMATCH');
 assert.ok(!headers['content-encoding']||headers['content-encoding']==='identity','CANARY_ENCODED_RESPONSE');
 assert.match(headers['content-type']||'',/^(?:application\/octet-stream|text\/plain)(?:;|$)/i,'CANARY_MIME_MISMATCH');
 assert.match(headers['content-disposition']||'',/^attachment(?:;|$)/i,'CANARY_ATTACHMENT_REQUIRED');
}
module.exports={CANARY,requireCanaryDestination,requireCanaryHeaders};
