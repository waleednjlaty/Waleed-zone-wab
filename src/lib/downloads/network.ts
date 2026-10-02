import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { DownloadError } from './rules';

export function normalizeNetwork(value: string) {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) throw new DownloadError(503, 'VERIFICATION_UNAVAILABLE');
  // WHATWG canonicalizes mapped IPv4 and compressed IPv6. Aggregate genuine IPv6 to /64.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right = ''] = canonical.split('::');
  const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
  const groups = canonical.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  const words = groups.map(x => parseInt(x, 16));
  if (words.slice(0, 5).every(x => x === 0) && words[5] === 65535)
    return `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  return words.slice(0, 4).map(x => x.toString(16).padStart(4, '0')).join(':') + '::/64';
}
export function trustedNetworks(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const header = env.DOWNLOAD_TRUSTED_IP_HEADER?.toLowerCase();
  const key = env.DOWNLOAD_IP_HASH_KEY;
  // Must be an ingress-overwritten single-address header. Forwarded lists are never guessed.
  if (env.DOWNLOAD_INGRESS_VERIFIED !== 'true' || !header || !/^[a-z0-9-]+$/.test(header)
    || ['forwarded', 'x-forwarded-for', 'host'].includes(header) || !key || key.length < 32)
    throw new DownloadError(503, 'VERIFICATION_UNAVAILABLE');
  const ip = request.headers.get(header);
  if (!ip || ip.length > 64) throw new DownloadError(503, 'VERIFICATION_UNAVAILABLE');
  const network = normalizeNetwork(ip);
  const hashes = [createHmac('sha256', key).update(network).digest('hex')];
  if (env.DOWNLOAD_IP_HASH_PREVIOUS_KEY) {
    const until = Date.parse(env.DOWNLOAD_IP_HASH_OVERLAP_UNTIL || '');
    if (env.DOWNLOAD_IP_HASH_PREVIOUS_KEY.length < 32 || !Number.isFinite(until))
      throw new DownloadError(503, 'VERIFICATION_UNAVAILABLE');
    if (Date.now() < until) hashes.push(createHmac('sha256', env.DOWNLOAD_IP_HASH_PREVIOUS_KEY).update(network).digest('hex'));
  }
  return [...new Set(hashes)].sort();
}
