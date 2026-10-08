import 'server-only';
import postgres, {type Sql} from 'postgres';
import {logFailure} from '@/lib/security/logging';
export const METRICS=['detail_view','download_page_view','download_prepare','download_redeem','telegram_redirect','catalog_view','external_download_redirect'] as const;
export type Metric=typeof METRICS[number];
export function validMetric(metric:unknown,applicationId:unknown):metric is Metric {
  return typeof metric==='string'&&(METRICS as readonly string[]).includes(metric)
    &&(metric==='catalog_view'?applicationId===null:Number.isSafeInteger(applicationId)&&Number(applicationId)>0&&Number(applicationId)<=2147483647);
}
let pool:Sql|undefined,inFlight=0,minute=0,hits=0,lastFailure=0,hasWritten=false;
/** Finite diagnostic categories only; driver messages can contain private connection data. */
export function metricFailureCategory(error:unknown):string {
  const code=error && typeof error==='object' && 'code' in error?String(error.code):'';
  const categories:Record<string,string>={CONNECT_TIMEOUT:'CONNECT_TIMEOUT',ETIMEDOUT:'CONNECT_TIMEOUT',ECONNREFUSED:'CONNECTION_REFUSED',ENOTFOUND:'DNS_UNAVAILABLE',CONNECTION_CLOSED:'CONNECTION_CLOSED',CONNECTION_DESTROYED:'CONNECTION_CLOSED',
    '57014':'STATEMENT_TIMEOUT','55P03':'LOCK_TIMEOUT','42P01':'SCHEMA_UNAVAILABLE','42703':'SCHEMA_UNAVAILABLE','23514':'CONSTRAINT_FAILURE','42501':'PERMISSION_DENIED','28P01':'AUTHENTICATION_FAILED'};
  return Object.hasOwn(categories,code)?categories[code]:'UNKNOWN';
}
function metricsSql(){
  if(!process.env.DATABASE_URL)return null;
  // One isolated, short-lived low-priority connection protects the critical download pool.
  // Production TLS startup exceeds one second; only connection establishment gets three seconds.
  pool??=postgres(process.env.DATABASE_URL,{prepare:false,max:1,idle_timeout:5,connect_timeout:3,
    connection:{statement_timeout:250,lock_timeout:50,idle_in_transaction_session_timeout:1000},
    ...(/neon\.tech|sslmode|ssl=true/.test(process.env.DATABASE_URL)?{ssl:'require' as const}:{})});
  return pool;
}
/** Trusted server hooks only. Never accepts request bodies, identity, destinations or file IDs. */
export async function recordMetric(metric:unknown,applicationId:unknown,options:{sql?:Sql;date?:string;now?:number}={}):Promise<boolean>{
  if(!validMetric(metric,applicationId))return false;
  const now=options.now??Date.now(),date=options.date??new Date(now).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return false;
  // No unbounded queue. Existing download rate guards run before download events.
  if(!options.sql){const current=Math.floor(now/60000);if(current!==minute){minute=current;hits=0;}if(inFlight>=1||++hits>1200)return false;}
  inFlight++;
  try{
    const sql=options.sql??metricsSql();if(!sql)return false;
    const rows=applicationId===null
      ?await sql`INSERT INTO site_daily_metrics(metric_date,metric,application_id,value) VALUES(${date},${metric},NULL,1)
          ON CONFLICT ON CONSTRAINT site_daily_metrics_daily_key DO UPDATE SET value=LEAST(site_daily_metrics.value+1,9007199254740991) RETURNING value`
      :await sql`INSERT INTO site_daily_metrics(metric_date,metric,application_id,value)
          SELECT ${date},${metric},id,1 FROM applications WHERE id=${Number(applicationId)} AND active=true AND published=true
          ON CONFLICT ON CONSTRAINT site_daily_metrics_daily_key DO UPDATE SET value=LEAST(site_daily_metrics.value+1,9007199254740991) RETURNING value`;
    if(rows.length===1 && !options.sql && !hasWritten){hasWritten=true;console.info(JSON.stringify({area:'analytics',code:'METRIC_WRITE_READY'}));}
    return rows.length===1;
  }catch(error){if(now-lastFailure>60000){lastFailure=now;logFailure('analytics','METRIC_WRITE_UNAVAILABLE_'+metricFailureCategory(error));}return false;}
  finally{inFlight--;}
}
