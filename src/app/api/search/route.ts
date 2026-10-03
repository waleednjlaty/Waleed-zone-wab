import { NextResponse } from 'next/server';
import { getApps } from '@/lib/queries';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { sanitizeSearch } from '@/lib/utils';
import { getSql } from '@/lib/db';
import { consumeWindow, requestNetwork } from '@/lib/security/limits';
export async function GET(request:Request) {
  const query=sanitizeSearch(new URL(request.url).searchParams.get('q')||'');
  if(!query)return NextResponse.json({items:[],total:0});
  try {
    const sql=getSql();
    if(sql && !await consumeWindow(sql,'search:network:'+requestNetwork(request,process.env),600,60))
      return NextResponse.json({error:'طلبات كثيرة، حاول بعد دقيقة'},{status:429,headers:{'Retry-After':'60'}});
    const result=await getApps({q:query,limit:8});
    // Explicit public DTO: no download destinations, flags or private fields.
    return NextResponse.json({items:result.items.map(app=>({id:app.id,name:appName(app),category:app.category,developer:app.developer,imageUrl:app.imageUrl,href:appHref(app)})),total:result.total});
  } catch { return NextResponse.json({error:'البحث غير متاح مؤقتًا'},{status:503}); }
}
