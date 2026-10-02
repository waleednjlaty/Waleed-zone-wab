/** Search representations only; never rewrite names stored by the publisher. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export const compactSearch = (value: string) => normalizeSearch(value).replace(/ /g, '');
// A lower-ranked alternative, not a destructive ة -> ه rewrite.
export const arabicAlternative = (value: string) => normalizeSearch(value).replace(/ة\b/gu, 'ه').replace(/ة(?=\s|$)/g, 'ه');
const roman: Record<string, string> = {ا:'a',ب:'b',ت:'t',ث:'th',ج:'j',ح:'h',خ:'kh',د:'d',ذ:'dh',ر:'r',ز:'z',س:'s',ش:'sh',ص:'s',ض:'d',ط:'t',ظ:'z',ع:'a',غ:'gh',ف:'f',ق:'q',ك:'k',ل:'l',م:'m',ن:'n',ه:'h',و:'w',ي:'y',ة:'h',ء:''};
export function transliterate(value: string) {
  return normalizeSearch(value).replace(/[\u0621-\u064a]/g, c => roman[c] ?? c);
}
const englishKeys="qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const arabicKeys=['ض','ص','ث','ق','ف','غ','ع','ه','خ','ح','ج','د','ش','س','ي','ب','ل','ا','ت','ن','م','ك','ط','ئ','ء','ؤ','ر','لا','ى','ة','و','ز','ظ','ذ'];
export function keyboardAlternative(value: string) {
  if(/[a-z]/i.test(value))return normalizeSearch([...value.toLowerCase()].map(c=>{const i=englishKeys.indexOf(c);return i<0?c:arabicKeys[i]||c;}).join(''));
  return normalizeSearch([...value].map(c=>{const i=arabicKeys.indexOf(c);return i<0?c:englishKeys[i]||c;}).join(''));
}
