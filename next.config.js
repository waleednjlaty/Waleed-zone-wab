const isDev = process.env.NODE_ENV === 'development';
const adsReady = /^ca-pub-\d{16}$/.test(process.env.ADSENSE_PUBLISHER_ID || '') && process.env.ADSENSE_CONTENT_REVIEWED === 'true' && process.env.ADSENSE_ENABLED === 'true';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(!adsReady ? ["frame-src 'none'"] : []),
  "script-src-attr 'none'",
  "frame-ancestors 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${adsReady ? ' https://pagead2.googlesyndication.com https://www.googletagservices.com https://googleads.g.doubleclick.net' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${adsReady ? ' https:' : ''}${isDev ? ' ws: wss:' : ''}`,
  ...(adsReady ? ["frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com", "child-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com"] : []),
  "form-action 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join('; ');

// Only exact configured hostnames can be used by native download form redirects.
const downloadFormHosts = ['t.me', ...(process.env.LEGACY_DOWNLOAD_ALLOWED_HOSTS || 'devuploads.com,shrinkme.io,shrinkme.site').split(','),
  ...(process.env.DOWNLOAD_ALLOWED_DELIVERY_HOSTS || '').split(',')]
  .map(host => host.trim()).filter(host => /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host));
const downloadCsp = csp.replace("form-action 'self'", `form-action 'self' ${[...new Set(downloadFormHosts)].map(host => 'https://' + host).join(' ')}`);

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '0' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(!isDev && (process.env.NEXT_PUBLIC_SITE_URL || 'https://waleed-zone.up.railway.app').startsWith('https://') ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Content-Security-Policy', value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/:legal(privacy|terms)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }] },
      { source: '/:utility(login|register|download)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] },
      { source: '/:private(account|users|admin|dashboard|settings|database|debug|logs|uploads|private|manage|management)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }, { key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/download/:path*', headers: [{ key: 'Content-Security-Policy', value: downloadCsp }, { key: 'Cache-Control', value: 'private, no-store' }, { key: 'Referrer-Policy', value: 'same-origin' }] },
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/api/downloads/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/api/downloads/legacy/redeem', headers: [{ key: 'Content-Security-Policy', value: downloadCsp }] },
    ];
  },
};

module.exports = nextConfig;
