import 'server-only';
import { Parser } from 'htmlparser2';
import { providerError } from './public-http';

/** SAX parsing: no DOM tree, no repeated regex scans of malformed HTML.
 * HTTP already caps input at 1 MiB. Stop at the first validated result and
 * bound tag work; quoted text, comments and scripts cannot impersonate attributes.
 */
export function firstHtmlAttribute(html: string, attribute: string, accept: (value: string, tag: string) => string | undefined) {
  let found: string | undefined, tags = 0;
  const parser = new Parser({
    onopentag(tag, attributes) {
      if (++tags > 10000) throw providerError('INVALID_PROVIDER_RESPONSE');
      const value = attributes[attribute];
      if (typeof value !== 'string' || value.length > 4096) return;
      const result = accept(value, tag);
      if (result) { found = result; parser.pause(); }
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.end(html);
  return found;
}

/** Bounded alternative endpoints, preserving the provider's order. */
export function htmlAttributes(html: string, attribute: string, accept: (value: string, tag: string) => string | undefined) {
  const found: string[]=[];let tags=0;
  const parser=new Parser({onopentag(tag,attributes){
    if(++tags>10000)throw providerError('INVALID_PROVIDER_RESPONSE');
    const raw=attributes[attribute]||(attribute==='hx-get'?attributes['data-hx-get']:undefined);if(typeof raw!=='string'||raw.length>4096)return;
    const value=accept(raw,tag);if(value&&!found.includes(value))found.push(value);
    if(found.length===3)parser.pause();
  }},{decodeEntities:true,lowerCaseTags:true,lowerCaseAttributeNames:true});
  parser.end(html);return found;
}
