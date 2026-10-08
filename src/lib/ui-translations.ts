import english from './ui-en.json';
import type { Locale } from './locale';

/** Static UI text only. Never pass stored catalog content or API payload fields. */
export function translateUI(locale: Locale, text: string, ...values: unknown[]): string {
  const dictionary: Readonly<Record<string, string>> = english;
  const wait = /^طلبات كثيرة\. انتظر ([0-9]+) ثانية ثم أعد المحاولة\.$/.exec(text);
  if (locale === 'en' && wait) return `Too many requests. Wait ${wait[1]} seconds and try again.`;
  const template = locale === 'en' ? dictionary[text] ?? text : text;
  return template.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)]) : match);
}
