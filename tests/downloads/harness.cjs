'use strict';
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fixtureData, ids } = require('./fixtures.cjs');
const A = require('./assertions.cjs');
const origin = 'https://waleed-zone.example.test';
const adapterPath = path.join(__dirname, 'runtime-adapter.cjs');
const available = existsSync(adapterPath);
const expectedReason = 'Expected contract failure: Agent G runtime adapter is not integrated (tests/downloads/runtime-adapter.cjs).';
function blockExternalIO() {
    // In-process handlers only: never bootstrap a server, use DATABASE_URL, or fetch a delivery URL.
    for (const key of Object.keys(process.env))
        if (/(?:DATABASE_URL|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|STORAGE|AWS_|S3_|RAILWAY_|REDIS_URL|NEON_|SUPABASE_)/.test(key))
            delete process.env[key];
    const deny = () => { throw new Error('Download contract suite forbids network I/O; inject repository/storage fakes.'); };
    global.fetch = deny;
    for (const name of ['node:http', 'node:https']) {
        const mod = require(name);
        mod.request = deny;
        mod.get = deny;
    }
    require('node:net').Socket.prototype.connect = deny;
    require('node:dgram').Socket.prototype.send = deny;
    for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
        require('node:child_process')[method] = deny;
}
async function setup(t, options = {}) {
    assert.ok(available, expectedReason);
    blockExternalIO();
    const clock = { nowMs: Date.parse('2026-10-02T04:40:00.000Z'), advance(ms) { this.nowMs += ms; }, set(ms) { this.nowMs = ms; } };
    const { createFixture } = require(adapterPath);
    assert.equal(typeof createFixture, 'function');
    const fixture = await createFixture({ clock, origin, data: fixtureData(), ...options });
    for (const method of ['dispatch', 'createActor', 'patch', 'fault', 'snapshot', 'close'])
        assert.equal(typeof fixture[method], 'function', `adapter.${method} required`);
    t.after(() => fixture.close());
    async function actor(settings = {}) {
        const identity = await fixture.createActor(settings);
        const client = { ...identity, cookie: identity.cookie || '', csrf: null };
        const response = await send(client, '/api/downloads/session', { body: {}, csrf: false });
        assert.equal(response.status, 200);
        const data = await A.json(response);
        A.noPrivate(data);
        assert.equal(typeof data.csrf_token, 'string');
        assert.ok(data.csrf_token.length >= 32);
        assert.deepEqual(Object.keys(data).sort(), ['csrf_token', 'server_time']);
        client.csrf = data.csrf_token;
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
            assert.match(cookie, /HttpOnly/i);
            assert.match(cookie, /Secure/i);
            assert.match(cookie, /SameSite=Lax/i);
            assert.match(cookie, /Path=\//i);
            assert.ok(!/;\s*Domain=/i.test(cookie));
            client.cookie = [client.cookie, cookie.split(';')[0]].filter(Boolean).join('; ');
        }
        assert.ok(client.cookie, 'adapter must retain bootstrap cookie');
        return client;
    }
    async function send(client, url, { method = 'POST', body = {}, form = false, csrf = true, key, headers = {}, raw, worker = 0 } = {}) {
        const h = new Headers({ Origin: origin, 'Sec-Fetch-Site': 'same-origin', Accept: 'application/json', ...headers });
        if (client?.cookie)
            h.set('Cookie', client.cookie);
        if (method !== 'GET' && method !== 'HEAD') {
            if (!h.has('Content-Type'))
                h.set('Content-Type', form ? 'application/x-www-form-urlencoded' : 'application/json');
            if (csrf && !form && client?.csrf)
                h.set('X-CSRF-Token', client.csrf);
        }
        if (key)
            h.set('Idempotency-Key', key);
        // Explicit null removes a default header (missing Origin/CSRF/content-type tests).
        for (const [name, value] of Object.entries(headers))
            if (value === null)
                h.delete(name);
        const content = raw !== undefined ? raw : form ? new URLSearchParams(body).toString() : JSON.stringify(body);
        const request = new Request(origin + url, { method, headers: h, ...(method === 'GET' || method === 'HEAD' ? {} : { body: content }) });
        const response = await fixture.dispatch(request, { actor: client?.id, worker });
        assert.ok(response instanceof Response, 'adapter must return actual handler Response');
        return response;
    }
    const payload = { application_id: ids.app, version_id: ids.version, file_id: ids.file };
    const request = (client, options = {}) => send(client, '/api/downloads/requests', { body: payload, key: randomUUID(), ...options });
    const status = (client, id, options = {}) => send(client, `/api/downloads/requests/${id}`, { method: 'GET', ...options });
    const token = (client, id, options = {}) => send(client, `/api/downloads/requests/${id}/token`, options);
    const redeem = (client, id, value, options = {}) => send(client, '/api/downloads/redeem', { form: true, body: { request_id: id, token: value, csrf_token: client?.csrf || '' }, ...options });
    async function ready(client) { const r = await A.admitted(await request(client)); clock.set(A.timestamp(r.ready_at)); return r; }
    async function grant(client) { const r = await ready(client); return { r, token: await A.issued(await token(client, r.request_id), r) }; }
    return { fixture, clock, actor, send, request, status, token, redeem, payload, ready, grant };
}
module.exports = { setup, available, expectedReason, origin, blockExternalIO };
