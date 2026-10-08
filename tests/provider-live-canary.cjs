'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {canaryExpectation}=require('../scripts/test-provider-live.cjs');
test('original 89-byte live canary remains runnable without a self-reference',()=>{
 assert.deepEqual(canaryExpectation('https://buzzheavier.com/724hyjkckpyu'),{
  bytes:89,sha256:'9ed9a2a5581029dd242caf417d58af6c4e1abff4795a55708bb63b9dc5a422c2'});
});
test('67-byte live canary retains its independent length and hash on both observed hosts',()=>{
 for(const host of ['bzzhr.co','buzzheavier.com'])assert.deepEqual(canaryExpectation(`https://${host}/8hcdyeypd460`),{
  bytes:67,sha256:'6c2b4eccbe5ad9d248f33983d466fefd5e619046320f429f78dd486c578496bc'});
});
test('live canary refuses arbitrary files or signed/catalog URL variants before network work',()=>{
 for(const url of ['https://buzzheavier.com/game','https://buzzheavier.com/724hyjkckpyu?v=secret',
  'https://evil.test/724hyjkckpyu','http://buzzheavier.com/724hyjkckpyu'])assert.throws(()=>canaryExpectation(url));
});
