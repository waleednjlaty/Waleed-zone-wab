import postgres from 'postgres';
import {applyMonetizationMigration} from './lib/monetization-migration.mjs';
// Explicit operator/pre-deploy ONLY; never imported by start, build or request code.
if(!process.env.DATABASE_URL){console.error('Monetization migration: DATABASE_URL_REQUIRED');process.exitCode=1;}
else {
  let sql;
  try{sql=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:5});console.log('Monetization migration: '+await applyMonetizationMigration(sql));}
  catch(error){console.error('Monetization migration: '+(error?.message==='CHECKSUM_MISMATCH'?'CHECKSUM_MISMATCH':'FAILED'));process.exitCode=1;}
  finally{try{await sql?.end();}catch{console.error('Monetization command: CLOSE_FAILED');process.exitCode=1;}}
}
