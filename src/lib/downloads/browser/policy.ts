import 'server-only';
import { publicUrl, providerError } from '../providers/public-http';
import { BZZHR_HOSTS } from '../providers/bzzhr';
export function stableBzzhr(raw:string) {
  const url=publicUrl(raw,BZZHR_HOSTS);
  if(url.search || !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))throw providerError('INVALID_SOURCE');
  return url.href;
}
