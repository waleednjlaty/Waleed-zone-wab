import { NextResponse } from 'next/server';
import { getApps } from '@/lib/queries';
import { appName } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { sanitizeSearch } from '@/lib/utils';
export async function GET(request:Request) {
  const query=sanitizeSearch(new URL(request.url).searchParams.get('q')||'');
  if(!query)return NextResponse.json({items:[],total:0});
  try {
    const result=await getApps({q:query,limit:8});
    // Explicit public DTO: no download destinations, flags or private fields.
    return NextResponse.json({items:result.items.map(app=>({id:app.id,name:appName(app),category:app.category,developer:app.developer,imageUrl:app.imageUrl,href:appHref(app)})),total:result.total});
  } catch { return NextResponse.json({error:'البحث غير متاح مؤقتًا'},{status:503}); }
}
