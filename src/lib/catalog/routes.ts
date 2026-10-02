import { appName, isGame } from '@/components/catalog/presentation';
export function appHref(app:{id:number;name:string|null;category:string|null}):string {
  const slug=appName(app).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,90).replace(/-$/,'') || 'app';
  return `/${isGame(app)?'games':'apps'}/${slug}-${app.id}`;
}
export function idFromSlug(slug:string):number|null {
  const match=slug.match(/-(\d{1,10})$/);
  const id=match?Number(match[1]):0;
  return Number.isSafeInteger(id)&&id>0&&id<=2147483647?id:null;
}
