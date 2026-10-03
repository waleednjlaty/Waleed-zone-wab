/** Edge-compatible policy. Navigation is allowed; only native form redirects need hosts. */
export function contentSecurityPolicy(nonce: string, env: NodeJS.ProcessEnv, download: boolean): string {
  const dev=env.NODE_ENV==='development';
  const ads=/^ca-pub-\d{16}$/.test(env.ADSENSE_PUBLISHER_ID||'') && env.ADSENSE_CONTENT_REVIEWED==='true' && env.ADSENSE_ENABLED==='true';
  const hosts=['t.me',...(env.LEGACY_DOWNLOAD_ALLOWED_HOSTS||'devuploads.com,shrinkme.io,shrinkme.site').split(','),
    ...(env.DOWNLOAD_ALLOWED_DELIVERY_HOSTS||'').split(',')].map(s=>s.trim()).filter(s=>/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(s));
  return ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}'${dev?" 'unsafe-eval'":''}${ads?' https://pagead2.googlesyndication.com https://www.googletagservices.com https://googleads.g.doubleclick.net':''}`,
    "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
    "font-src 'self' data:", `connect-src 'self'${ads?' https:':''}${dev?' ws: wss:':''}`,
    ads?'frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com':"frame-src 'none'",
    `form-action 'self'${download?' '+[...new Set(hosts)].map(s=>'https://'+s).join(' '):''}`,
    "worker-src 'self' blob:", ...(!dev?['upgrade-insecure-requests']:[])].join('; ');
}
