import { compactSearch, normalizeSearch } from './normalize';

export interface AliasEntry { names: string[]; aliases: string[]; }
// Publisher-neutral vocabulary. Per-application aliases belong to catalog metadata,
// not components. This layer can later be supplied by an authorized CMS/provider.
export const aliasVocabulary: AliasEntry[] = [
  { names:['WhatsApp'], aliases:['واتساب','واتس اب','واتس آب'] },
  { names:['Telegram'], aliases:['تلغرام','تليجرام','تيليجرام','تيليغرام'] },
  { names:['Instagram'], aliases:['انستغرام','إنستغرام','انستجرام','انستا'] },
  { names:['Spotify'], aliases:['سبوتيفاي'] },
  { names:['TikTok','Tik Tok'], aliases:['تيك توك','تيكتوك'] },
  { names:['Facebook'], aliases:['فيسبوك','فيس بوك'] },
  { names:['Snapchat'], aliases:['سناب شات','سنابشات'] },
  { names:['Clash of Clans'], aliases:['كلاش اوف كلانس','كلاش أوف كلانس'] },
  { names:['Grand Theft Auto','GTA'], aliases:['جراند ثفت اوتو','جي تي اي','قراند'] },
  { names:['Call of Duty'], aliases:['كول اوف ديوتي','كول أوف ديوتي'] },
  { names:['CapCut'], aliases:['كاب كت','كابكت','كاب كات'] },
];
export function aliasesFor(name: string): string[] {
  const normalized=normalizeSearch(name);
  const tokens=normalized.split(' ');
  return aliasVocabulary.filter(entry=>entry.names.some(base=>{
    const n=normalizeSearch(base);
    return compactSearch(normalized)===compactSearch(n) || normalized===n || (normalized.startsWith(`${n} `) && /^(?:v?\d|pro\b|premium\b|mod\b|lite\b|plus\b|business\b|apk\b)/.test(normalized.slice(n.length+1))) || (n==='gta' && tokens.includes(n));
  })).flatMap(entry=>[...entry.names,...entry.aliases]);
}
