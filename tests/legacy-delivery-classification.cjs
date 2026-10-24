'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
require('./helpers/typescript.cjs');

const originalLoad = Module._load;
class DownloadError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const mockPublicUrl = (value, hosts) => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) throw new Error('INVALID_SOURCE');
  return url;
};
Module._load = function(name, ...args) {
  if (name === 'server-only') return {};
  if (name === '@/lib/downloads/rules') return { DownloadError };
  if (name === './telegram') return {
    telegramDestination: (username, message) => 'https://t.me/' + username + '/' + message,
  };
  if (name === '@/lib/downloads/providers/public-http') return { publicUrl: mockPublicUrl };
  if (name === '@/lib/downloads/providers/steamrip') return { STEAMRIP_HOSTS: ['steamrip.com', 'www.steamrip.com'] };
  if (name === '@/lib/downloads/providers/bzzhr') return { BZZHR_HOSTS: ['bzzhr.to', 'www.bzzhr.to', 'bzzhr.co', 'www.bzzhr.co', 'buzzheavier.com', 'www.buzzheavier.com'] };
  return originalLoad.call(this, name, ...args);
};
const { legacyDelivery } = require('../src/lib/delivery/legacy.ts');
Module._load = originalLoad;

function fakeSql(app) {
  return async (strings) => {
    const query = strings.join(' ');
    if (query.includes('to_regclass')) return [{ config: 'site_download_app_config', sources: 'site_delivery_sources' }];
    if (query.includes('FROM applications a')) return [app];
    throw new Error('Unexpected SQL query');
  };
}
const baseApp = (overrides = {}) => ({
  id: 42, active: true, published: true, revision: 7, shrankme_url: null,
  devupload_url: null, mode: 'legacy', telegram_channel_username: null,
  telegram_message_id: null, ...overrides,
});
const env = { FILES_CHANNEL_USERNAME: 'waleedzonefiles', CHANNEL_USERNAME: 'waleedzone' };

test('Telegram source wins and returns the canonical message URL', async () => {
  const app = baseApp({ telegram_channel_username: 'waleedzonefiles', telegram_message_id: 123 });
  const result = await legacyDelivery(fakeSql(app), 42, env);
  assert.equal(result.provider, 'telegram');
  assert.equal(result.destination, 'https://t.me/waleedzonefiles/123');
});

test('BZZHR manual links are external redirects and never enter SteamRIP extraction', async () => {
  const app = baseApp({ shrankme_url: 'https://bzzhr.to/example' });
  const result = await legacyDelivery(fakeSql(app), 42, env);
  assert.equal(result.provider, 'external');
  assert.equal(result.destination, 'https://bzzhr.to/example');
});

test('SteamRIP source pages retain the dedicated SteamRIP provider', async () => {
  const app = baseApp({ devupload_url: 'https://steamrip.com/example-game/' });
  const result = await legacyDelivery(fakeSql(app), 42, env);
  assert.equal(result.provider, 'steamrip');
  assert.equal(result.destination, 'https://steamrip.com/example-game/');
});

test('approved legacy hosts remain external redirects', async () => {
  const app = baseApp({ devupload_url: 'https://devuploads.com/file/abc' });
  const result = await legacyDelivery(fakeSql(app), 42, { ...env, LEGACY_DOWNLOAD_ALLOWED_HOSTS: 'devuploads.com,shrinkme.io' });
  assert.equal(result.provider, 'external');
  assert.equal(result.destination, 'https://devuploads.com/file/abc');
});
