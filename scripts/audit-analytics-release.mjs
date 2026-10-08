/** Read-only release diagnostics. Never logs connection strings, rows or counters. */
import postgres from 'postgres';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const metrics=['detail_view','download_page_view','download_prepare','download_redeem','telegram_redirect','catalog_view','external_download_redirect'];
export function failureCategory(error) {
  const code=error && typeof error==='object' && 'code' in error?String(error.code):'';
  const categories={CONNECT_TIMEOUT:'CONNECT_TIMEOUT',ETIMEDOUT:'CONNECT_TIMEOUT',ECONNREFUSED:'CONNECTION_REFUSED',ENOTFOUND:'DNS_UNAVAILABLE',CONNECTION_CLOSED:'CONNECTION_CLOSED',CONNECTION_DESTROYED:'CONNECTION_CLOSED',
    '57014':'STATEMENT_TIMEOUT','55P03':'LOCK_TIMEOUT','42P01':'SCHEMA_UNAVAILABLE','42703':'SCHEMA_UNAVAILABLE','42501':'PERMISSION_DENIED','28P01':'AUTHENTICATION_FAILED'};
  return Object.hasOwn(categories,code)?categories[code]:'UNKNOWN';
}

export async function auditAnalytics(connection,{createSql=postgres,log=value=>console.info(JSON.stringify(value))}={}) {
  if(!connection)throw new Error('DATABASE_URL_REQUIRED');
  const ssl=/neon\.tech|sslmode|ssl=true/.test(connection)?{ssl:'require'}:{};
  const report=(code,extra={})=>log({area:'release_qa',code,...extra});
  let probe;
  try {
    // Match the production metrics connection deadline without performing any writes.
    probe=createSql(connection,{prepare:false,max:1,idle_timeout:5,connect_timeout:3,
      connection:{statement_timeout:250,lock_timeout:50,idle_in_transaction_session_timeout:1000,default_transaction_read_only:'on'},...ssl});
    await probe`SELECT 1`;
    report('ANALYTICS_RUNTIME_CONNECTION_READY');
  } catch(error) {
    report('ANALYTICS_RUNTIME_CONNECTION_FAILED',{category:failureCategory(error)});
  } finally {
    if(probe)await probe.end({timeout:2}).catch(()=>{});
  }

  let sql;
  try {
    sql=createSql(connection,{prepare:false,max:1,connect_timeout:5,
      connection:{statement_timeout:1500,lock_timeout:100,idle_in_transaction_session_timeout:2000,default_transaction_read_only:'on'},...ssl});
    const rows=await sql`SELECT metric,COALESCE(sum(value),0)::text AS value
      FROM site_daily_metrics
      WHERE metric_date=(clock_timestamp() AT TIME ZONE 'UTC')::date
      GROUP BY metric`;
    const present=metrics.filter(metric=>rows.some(row=>row.metric===metric && Number(row.value)>0));
    report('ANALYTICS_READ_VERIFIED',{today_has_events:present.length>0,metrics_present:present});
    return {todayHasEvents:present.length>0,metricsPresent:present};
  } finally {
    if(sql)await sql.end({timeout:2}).catch(()=>{});
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {await auditAnalytics(process.env.DATABASE_URL);}
  catch(error) {
    console.error(JSON.stringify({area:'release_qa',code:'ANALYTICS_READ_FAILED',category:failureCategory(error)}));
    process.exitCode=1;
  }
}
