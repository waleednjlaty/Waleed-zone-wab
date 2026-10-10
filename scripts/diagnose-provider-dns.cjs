'use strict';
// Fixed public names only. No resolver override, HTTP, URLs, IPs, or environment output.
const dns=require('node:dns').promises;
const hosts=['steamrip.com','buzzheavier.com','bzzhr.co','ts.buzzheavier.com','example.com'];
const codes=new Set(['EAI_AGAIN','ENOTFOUND','ENODATA','ETIMEOUT','ECONNREFUSED','ESERVFAIL','EREFUSED','ECANCELLED']);
(async()=>{
 for(const host of hosts) {
  let timer;
  try {
   const rows=await Promise.race([dns.lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:'ETIMEOUT'}),3000);})]);
   console.log(JSON.stringify({area:'provider_dns_probe',host,status:'RESOLVED',answer_count:rows.length,families:[...new Set(rows.map(r=>r.family))]}));
  }catch(error){console.log(JSON.stringify({area:'provider_dns_probe',host,status:'FAILED',dns_code:codes.has(error.code)?error.code:'DNS_FAILED'}));process.exitCode=1;}
  finally{clearTimeout(timer);}
 }
})();
