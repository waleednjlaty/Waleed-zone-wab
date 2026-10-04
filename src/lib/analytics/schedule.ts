import 'server-only';
import {after} from 'next/server';
import {headers} from 'next/headers';
import {recordMetric,type Metric} from './metrics';
export function metricRequestAllowed(h:Headers):boolean {
  // Framework prefetch suppression, not a fragile user-agent/robot classifier.
  return !h.has('next-router-prefetch')&&!/prefetch/i.test(h.get('purpose')||h.get('sec-purpose')||'')
    &&!h.has('x-nextjs-draft-mode');
}
export function scheduleMetrics(events:readonly {metric:Metric;id:number|null}[],h:Headers){
  if(!metricRequestAllowed(h))return;
  try{after(async()=>{for(const event of events.slice(0,2))await recordMetric(event.metric,event.id);});}catch{/* Tests/outside a Next request or unavailable runtime: no effect on response. */}
}
export function scheduleMetric(metric:Metric,id:number|null,h:Headers){scheduleMetrics([{metric,id}],h);}
export async function schedulePageMetric(metric:Metric,id:number|null,path:string){
  try{
    const h=await headers();let route='';try{route=decodeURIComponent(h.get('x-wz-route')||'');}catch{return;}
    if(route!==path||route.startsWith('/admin'))return;
    scheduleMetric(metric,id,h);
  }catch{/* Best effort; never converts a valid page into an error. */}
}
