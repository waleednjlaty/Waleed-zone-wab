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
