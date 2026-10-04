import 'server-only';
import type {Sql} from 'postgres';
import {AdminError,invalid} from './validation';
import {METRICS} from '@/lib/analytics/metrics';
export function analyticsWindow(request:Request){
  const query=new URL(request.url).searchParams;
  for(const key of query.keys())if(!['days','limit'].includes(key)||query.getAll(key).length!==1)throw invalid();
  const days=query.get('days')??'1',limit=query.get('limit')??'10';
  if(!/^[1-9][0-9]?$/.test(days)||Number(days)>90||!/^[1-9][0-9]?$/.test(limit)||Number(limit)>50)throw invalid();
  return {days:Number(days),limit:Number(limit)};
}
const count=(value:unknown)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new AdminError(503,'ANALYTICS_UNAVAILABLE');return n;};
export const conversion=(from:number,to:number)=>from?Math.round(to/from*10000)/100:null;
export class OwnerAnalyticsService{
  constructor(private sql:Sql){}
  async read(days:number,limit:number,now=new Date()){
    if(!Number.isInteger(days)||days<1||days>90||!Number.isInteger(limit)||limit<1||limit>50)throw invalid();
    const today=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
    const from=new Date(today.getTime()-(days-1)*86400000).toISOString().slice(0,10),until=new Date(today.getTime()+86400000).toISOString().slice(0,10);
    return this.sql.begin('read only isolation level repeatable read',async tx=>{
      await tx`SET LOCAL statement_timeout='1500ms'`;
      const rows=await tx`SELECT metric,sum(value)::text AS value FROM site_daily_metrics WHERE metric_date>=${from}::date AND metric_date<${until}::date GROUP BY metric`;
      const metrics=Object.fromEntries(METRICS.map(metric=>[metric,count(rows.find(row=>row.metric===metric)?.value??0)]));
      const [visitors]=await tx`SELECT count(*)::text AS value FROM site_visits WHERE visit_day>=${from}::date AND visit_day<${until}::date`;
      const top=await tx`SELECT a.id,a.name,COALESCE(sum(m.value) FILTER(WHERE m.metric='detail_view'),0)::text AS views,
        COALESCE(sum(m.value) FILTER(WHERE m.metric='download_redeem'),0)::text AS redeems FROM site_daily_metrics m
        JOIN applications a ON a.id=m.application_id WHERE m.metric_date>=${from}::date AND m.metric_date<${until}::date
        AND m.metric IN ('detail_view','download_redeem') GROUP BY a.id,a.name ORDER BY sum(m.value) FILTER(WHERE m.metric='detail_view') DESC NULLS LAST,
        sum(m.value) FILTER(WHERE m.metric='download_redeem') DESC NULLS LAST,a.id ASC LIMIT ${limit}`;
      return {days,from,to:today.toISOString().slice(0,10),timezone:'UTC',visitors:count(visitors.value),metrics,
        conversions:{detail_to_download:conversion(metrics.detail_view,metrics.download_page_view),download_to_redeem:conversion(metrics.download_page_view,metrics.download_redeem),redeem_to_redirect:conversion(metrics.download_redeem,metrics.telegram_redirect)},
        top:top.map(row=>({application_id:row.id,name:typeof row.name==='string'&&row.name.trim()?row.name:`تطبيق بدون اسم (${row.id})`,views:count(row.views),redeems:count(row.redeems),conversion:conversion(count(row.views),count(row.redeems))}))};
    });
  }
}
