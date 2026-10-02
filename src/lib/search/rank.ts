import { aliasesFor } from './aliases';
import { arabicAlternative, compactSearch, keyboardAlternative, normalizeSearch, transliterate } from './normalize';
import type { RankedDocument, SearchDocument } from './types';

// Bounded Levenshtein, restricted to >=4-character words and small edit budgets.
export function editDistance(a:string,b:string,max:number):number {
  if(Math.abs(a.length-b.length)>max)return max+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    const current=[i];
    for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    if(Math.min(...current)>max)return max+1;
    previous=current;
  }
  return previous[b.length];
}
function tokensMatch(query:string,value:string) {
  const tokens=query.split(' '),words=value.split(' ');
  return tokens.every(token=>words.some(word=>word===token || (token.length>=2 && word.startsWith(token))));
}
function typoMatch(query:string,value:string) {
  const q=compactSearch(query),v=compactSearch(value);
  if(q.length<4||v.length<4)return false;
  const edits=q.length>=8?2:1;
  return editDistance(q,v,edits)<=edits && Math.min(q.length,v.length)/Math.max(q.length,v.length)>=0.72;
}
export function rankDocument(document:SearchDocument,rawQuery:string):RankedDocument|null {
  const query=normalizeSearch(rawQuery); if(!query)return null;
  const names=[document.name,document.arabicName,document.englishName].filter((v):v is string=>Boolean(v));
  const aliases=[...(document.aliases||[]),...aliasesFor(document.name)];
  const n=names.map(normalizeSearch),a=aliases.map(normalizeSearch),all=[...n,...a];
  const raw=rawQuery.trim().toLowerCase();
  let score=0,reason='';
  const match=(value:number,label:string)=>{if(value>score){score=value;reason=label;}};
  if(names.some(v=>v.trim().toLowerCase()===raw))match(1000,'exact-name');
  if(aliases.some(v=>v.trim().toLowerCase()===raw))match(950,'exact-alias');
  if(n.some(v=>v===query || compactSearch(v)===compactSearch(query)))match(900,'normalized-name');
  if(a.some(v=>v===query || compactSearch(v)===compactSearch(query)))match(870,'normalized-alias');
  if(query.length>=2 && n.some(v=>v.startsWith(query)))match(800+Math.max(...n.filter(v=>v.startsWith(query)).map(v=>Math.floor(10*query.length/v.length))),'name-prefix');
  if(query.length>=2 && a.some(v=>v.startsWith(query)))match(780+Math.max(...a.filter(v=>v.startsWith(query)).map(v=>Math.floor(10*query.length/v.length))),'alias-prefix');
  if(query.length>=4 && all.some(v=>transliterate(v)===transliterate(query)))match(740,'transliteration');
  if(query.length>=2 && all.some(v=>tokensMatch(query,v)))match(700,'tokens');
  if(query.length>=3 && all.some(v=>arabicAlternative(v)===arabicAlternative(query)))match(680,'arabic-alternative');
  const relevant=[document.developer,document.category,...(document.tags||[])].filter((v):v is string=>Boolean(v)).map(normalizeSearch);
  if(relevant.some(v=>tokensMatch(query,v)))match(600,'developer-category-tags');
  if(query.length>=3 && document.packageName && normalizeSearch(document.packageName)===query)match(620,'package');
  if(all.some(v=>typoMatch(query,v)))match(400,'typo');
  const keyboard=keyboardAlternative(rawQuery);
  if(query.length>=4 && keyboard!==query){
    if(all.some(v=>v===keyboard))match(270,'keyboard-exact');
    else if(all.some(v=>v.startsWith(keyboard)))match(250,'keyboard-prefix');
  }
  if(query.length>=4 && document.description && tokensMatch(query,normalizeSearch(document.description)))match(150,'description');
  return score?{id:document.id,score,reason}:null;
}
export function rankDocuments(documents:SearchDocument[],query:string,limit=60):RankedDocument[] {
  const popularity=new Map(documents.map(d=>[d.id,Math.max(0,d.downloads||0)]));
  return documents.map(d=>rankDocument(d,query)).filter((v):v is RankedDocument=>v!==null)
    .sort((a,b)=>b.score-a.score || (popularity.get(b.id)||0)-(popularity.get(a.id)||0) || a.id-b.id).slice(0,limit);
}
